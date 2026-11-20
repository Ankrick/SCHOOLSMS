const Student = require("../models/Student");
const Batch = require("../models/Batch");
const Settings = require("../models/Settings");
const PaymentHistory = require("../models/PaymentHistory");
const mongoose = require("mongoose");
const { readSlipPayload, readPaidDate, withoutSlipImage } = require("../utils/slip");
const { normalizePlan, chargeAt, addMonths, currentMonthKey, feeFor, planOf } = require("../utils/billing");
const { nextReference } = require("../utils/reference");
const { enrollmentsOf, billingSubject, enrollmentIdOfPayment, materialize, studentJSON } = require("../utils/enrollments");

// All an operator gets of a student: who they are, which batches, and how to reach them.
// Status rides along so the page can still filter to active students. Fees, payment plans,
// billing dates and the guardian contact finance invoices are left out.
const OPERATOR_STUDENT_FIELDS = "name nameBurmese batchId status parentPhone telegram enrollments._id enrollments.batchId enrollments.status";
const operatorView = (student) => ({
  id: student.id,
  name: student.name,
  nameBurmese: student.nameBurmese || "",
  status: student.status,
  parentPhone: student.parentPhone || "",
  telegram: student.telegram || "",
  enrollments: enrollmentsOf(student).map(({ id, batchId, status }) => ({ id, batchId, status })),
});

exports.getStudents = async (req, res, next) => {
  try {
    const operator = req.user.role === "operator";
    const query = Student.find().sort({ name: 1 });
    if (operator) query.select(OPERATOR_STUDENT_FIELDS);
    const students = await query;
    res.json(students.map(operator ? operatorView : studentJSON));
  } catch (err) {
    next(err);
  }
};

// GET /api/students/new-per-month — who joined which batch each month, newest month first.
// Each batch a student joins is listed in the month they joined it; one who was already a
// student and added a batch is marked `existing`, so a month's count of new students stays
// a count of new people. Everyone counts whatever their status is now; a student who was
// deleted is gone from the records and so from these lists. Months with no one new stay in
// the list with an empty roster.
//
// Money is the owner's alone, so it is only ever read and worked out for the owner. Each
// entry then carries either `monthlyFee` or, on an installment plan, `installments`
// ({ count, total }) — an installment plan has no monthly figure.
exports.getNewStudentsPerMonth = async (req, res, next) => {
  try {
    const withMoney = req.user.role === "owner";
    const [students, batches, settings] = await Promise.all([
      Student.find()
        .select(`name nameBurmese status enrolledDate batchId enrollments${withMoney ? " customFee paymentPlan billingStartDate" : ""}`)
        .sort({ name: 1 }),
      Batch.find().select(withMoney ? "name fee" : "name").lean(),
      withMoney ? Settings.findOne().lean() : null,
    ]);
    const batchById = Object.fromEntries(batches.map((b) => [String(b._id), b]));
    const MONTH_OF = /^\d{4}-(0[1-9]|1[0-2])/;

    const byMonth = {};
    for (const student of students) {
      const firstMonth = MONTH_OF.test(student.enrolledDate || "") ? student.enrolledDate.slice(0, 7) : null;
      for (const enrollment of enrollmentsOf(student)) {
        const joined = MONTH_OF.test(enrollment.enrolledDate || "") ? enrollment.enrolledDate : student.enrolledDate;
        if (!MONTH_OF.test(joined || "")) continue;
        const month = joined.slice(0, 7);
        const batch = batchById[enrollment.batchId];
        const entry = {
          id: `${student.id}:${enrollment.id}`,
          studentId: student.id,
          name: student.name,
          nameBurmese: student.nameBurmese || "",
          batchId: batch ? enrollment.batchId : "",
          batchName: batch ? batch.name : "",
          // Left the batch, or the centre, since.
          status: student.status === "Active" && enrollment.status === "Inactive" ? "Inactive" : student.status,
          enrolledDate: joined,
          existing: !!firstMonth && firstMonth < month,
        };
        if (withMoney) {
          const subject = billingSubject(student, enrollment);
          const plan = planOf(subject);
          if (plan.kind === "installments") {
            entry.installments = {
              count: plan.installments.length,
              total: plan.installments.reduce((sum, i) => sum + i.amount, 0),
            };
          } else {
            entry.monthlyFee = feeFor(subject, batch, settings);
          }
        }
        (byMonth[month] = byMonth[month] || []).push(entry);
      }
    }
    for (const list of Object.values(byMonth)) list.sort((a, b) => b.enrolledDate.localeCompare(a.enrolledDate) || a.name.localeCompare(b.name));

    const found = Object.keys(byMonth).sort();
    if (found.length === 0) return res.json([]);

    const now = currentMonthKey();
    const last = found[found.length - 1] > now ? found[found.length - 1] : now;
    const months = [];
    for (let month = found[0]; month <= last; month = addMonths(`${month}-01`, 1).slice(0, 7)) {
      months.push({ month, students: byMonth[month] || [] });
    }
    res.json(months.reverse());
  } catch (err) {
    next(err);
  }
};

// ─── SAVING A STUDENT ───────────────────────────────────────────────
// A student is their details plus a list of enrollments, one per batch. Joining a batch is
// also its first payment, so every enrollment added — at registration or later — needs the
// same evidence as any other payment: the KBZPay slip and the date read off it. That date is
// also the day they joined the batch; nobody types it twice. Each new enrollment's first fee
// lands in payment history as a "registration" payment covering its plan's first period,
// which is what lets invoicing start from the second.

const PROFILE_FIELDS = [
  "name", "nameBurmese", "email", "phone", "telegram", "subject", "status", "strikes",
  "invoiceContact", "parentName", "parentPhone", "parentFacebook", "notes",
];
const pickProfile = (body) => Object.fromEntries(PROFILE_FIELDS.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]));

// The enrollments a form sent, checked and in the shape that is stored. Existing ones keep
// what the form does not own (when they joined, deleted invoices); new ones join on
// `paidDate`. A page loaded before enrollments sends one batch's fields on the student; that
// is read as its only enrollment.
function readEnrollments(body, existing, paidDate) {
  let list = body.enrollments;
  if (!Array.isArray(list)) {
    if (body.batchId === undefined && body.paymentPlan === undefined && body.customFee === undefined && body.billingStartDate === undefined) {
      return { enrollments: existing.map((e) => ({ ...e, _id: e.id, isNew: false })) };
    }
    const only = existing[0];
    list = [{
      id: only ? only.id : undefined,
      batchId: body.batchId !== undefined ? body.batchId : only && only.batchId,
      billingStartDate: body.billingStartDate !== undefined ? body.billingStartDate : only && only.billingStartDate,
      customFee: body.customFee !== undefined ? body.customFee : only && only.customFee,
      paymentPlan: body.paymentPlan !== undefined ? body.paymentPlan : only && only.paymentPlan,
      status: only ? only.status : "Active",
    }];
  }
  if (list.length === 0) return { error: "Choose at least one batch." };

  const byId = new Map(existing.map((e) => [e.id, e]));
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const batchId = String((raw && raw.batchId) || "");
    if (seen.has(batchId)) return { error: "The same batch is listed twice." };
    seen.add(batchId);
    const prev = raw.id ? byId.get(String(raw.id)) : null;
    if (raw.id && !prev) return { error: "One of those batches is no longer on this student. Reload the page and try again." };
    if (!prev && !paidDate) {
      return { error: "Enter the paid date and attach the KBZPay slip for the new batch's first payment." };
    }
    const enrolledDate = prev ? prev.enrolledDate : paidDate;
    const billingStartDate = raw.billingStartDate || (prev && prev.billingStartDate) || enrolledDate;
    const planCheck = normalizePlan(raw.paymentPlan, billingStartDate || enrolledDate);
    if (planCheck.error) return { error: planCheck.error };
    const fee = raw.customFee === "" || raw.customFee == null ? null : Number(raw.customFee);
    if (fee != null && !(Number.isFinite(fee) && fee >= 0)) return { error: "The fee must be a number of kyats." };
    out.push({
      _id: prev ? prev.id : new mongoose.Types.ObjectId().toString(),
      isNew: !prev,
      batchId,
      enrolledDate,
      billingStartDate,
      customFee: fee,
      paymentPlan: planCheck.plan,
      removedCharges: prev ? prev.removedCharges : [],
      status: raw.status === "Inactive" ? "Inactive" : "Active",
    });
  }
  return { enrollments: out };
}

const stored = ({ isNew, ...e }) => ({ ...e, _id: new mongoose.Types.ObjectId(e._id) });

// The first-payment record for one enrollment: its plan's first period, at what the plan
// says it costs. `existing` is the record being corrected, when there is one.
async function writeRegistration({ student, enrollment, settings, batchById, paidDate, slip, existing }) {
  const subject = billingSubject(student, enrollment);
  const batch = batchById[enrollment.batchId] || null;
  const charge = chargeAt(subject, batch, settings, 0);
  const fields = {
    studentId: student.id,
    enrollmentId: enrollment.id,
    studentName: student.name,
    studentEmail: student.email || "",
    nameBurmese: student.nameBurmese || "",
    batchId: enrollment.batchId || "",
    batchName: batch ? batch.name : "—",
    amount: charge.amount,
    paidDate,
    periodStart: charge.periodStart,
    periodEnd: charge.periodEnd,
    label: charge.label,
    kind: "registration",
    // Numbered 0 so it sits before the invoice payments without renumbering them.
    paymentCount: 0,
    notes: charge.label ? `Registration — ${charge.label.toLowerCase()}` : "Registration — first month",
  };
  if (existing) {
    existing.set(fields);
    if (slip) existing.slip = slip;
    return existing.save();
  }
  // The receipt wants a reference, and taking the next invoice number keeps every document
  // the centre hands out unique — there is simply no Invoice behind this one.
  return PaymentHistory.create({ ...fields, invoiceNumber: await nextReference(), slip });
}

async function batchesById() {
  const batches = await Batch.find();
  return Object.fromEntries(batches.map((b) => [b.id, b]));
}

// Applies a form to a student document (new or existing) and saves it, recording the first
// payment of every enrollment added.
//
// `correcting` puts right registration receipts just issued — `body.paymentIds` names them.
// Only the batches those receipts are for change their join date and receipt; a student's
// other batches are saved as an ordinary edit, so correcting a newly added second batch
// cannot rewrite the first.
async function saveStudent({ student, body, correcting = false }) {
  const isNew = student.isNew;
  const firstPayment = body.firstPayment;
  let paidDate = null;
  let slip = null;
  if (firstPayment) {
    if (correcting && !(firstPayment.slip && firstPayment.slip.image)) {
      // Correcting keeps the slip already on file unless a new one is attached.
      const check = readPaidDate(firstPayment.paidDate);
      if (check.error) return { status: 400, message: check.error };
      paidDate = check.paidDate;
    } else {
      const check = readSlipPayload(firstPayment, isNew ? "a student can be registered" : "the new batch can be added");
      if (check.error) return { status: 400, message: check.error };
      ({ paidDate, slip } = check);
    }
  }
  if (isNew && !paidDate) return { status: 400, message: "A KBZPay payment slip must be attached before a student can be registered." };

  const before = isNew ? [] : enrollmentsOf(student);
  const existingPayments = isNew ? [] : await PaymentHistory.find({ studentId: student.id });
  const enrollmentOf = (p) => enrollmentIdOfPayment(p, student);

  // The receipts being corrected, and the batches they are for.
  const correctIds = new Set((Array.isArray(body.paymentIds) ? body.paymentIds : []).map(String));
  const corrected = existingPayments.filter((p) => p.kind === "registration" && correctIds.has(p.id));
  const correctedEnrollments = new Set(corrected.map(enrollmentOf));
  if (correcting && corrected.length === 0) {
    return { status: 400, message: "Those receipts are not this student's registration. Reload the page and try again." };
  }

  const read = readEnrollments(body, before, paidDate);
  if (read.error) return { status: 400, message: read.error };
  // A corrected registration moves those batches' join date to the corrected paid date.
  const enrollments = read.enrollments.map((e) =>
    correcting && correctedEnrollments.has(e._id) ? { ...e, enrolledDate: paidDate } : e
  );

  // A batch with payments on it can be left, not erased — unless all it has is a receipt
  // being corrected, which goes with it.
  const keptIds = new Set(enrollments.map((e) => e._id));
  const dropped = before.filter((e) => !keptIds.has(e.id));
  for (const e of dropped) {
    const onIt = existingPayments.filter((p) => enrollmentOf(p) === e.id);
    if (onIt.some((p) => !(correcting && correctIds.has(p.id)))) {
      return { status: 409, message: "That batch has payments recorded against it. Mark it as left instead of removing it." };
    }
  }

  const nameBefore = [student.name, student.nameBurmese];
  student.set(pickProfile(body));
  materialize(student);
  student.enrollments = enrollments.map(stored);
  const dates = enrollments.map((e) => e.enrolledDate).filter(Boolean).sort();
  if (dates.length) student.enrolledDate = dates[0];
  await student.save();

  const [settings, batchById] = await Promise.all([Settings.findOne(), batchesById()]);
  const saved = enrollmentsOf(student);
  const added = saved.filter((x) => enrollments.find((n) => n._id === x.id && n.isNew));
  const payments = [];

  if (correcting) {
    for (const p of corrected.filter((x) => !keptIds.has(enrollmentOf(x)))) await p.deleteOne();
    for (const e of saved.filter((x) => correctedEnrollments.has(x.id))) {
      const existing = corrected.find((p) => enrollmentOf(p) === e.id);
      payments.push(await writeRegistration({ student, enrollment: e, settings, batchById, paidDate, slip, existing }));
    }
  }
  // A batch added while correcting was paid by the same transfer, so it shares the slip.
  const onFile = corrected.find((p) => p.slip && p.slip.image);
  const addedSlip = slip || (correcting && onFile ? onFile.slip.toObject() : null);
  for (const e of added) {
    payments.push(await writeRegistration({ student, enrollment: e, settings, batchById, paidDate, slip: addedSlip }));
  }

  // A corrected name reaches every receipt already issued to this student.
  if (!isNew && (nameBefore[0] !== student.name || nameBefore[1] !== student.nameBurmese)) {
    await PaymentHistory.updateMany({ studentId: student.id }, { $set: { studentName: student.name, nameBurmese: student.nameBurmese || "" } });
  }

  return { status: isNew ? 201 : 200, student, payments };
}

function reply(res, result) {
  if (result.message) return res.status(result.status).json({ message: result.message });
  const payments = result.payments.map(withoutSlipImage);
  // `payment` is the first of them, for a page loaded before students had several batches.
  res.status(result.status).json({ student: studentJSON(result.student), payments, payment: payments[0] || null });
}

// POST /api/students  { ...details, enrollments: [{ batchId, billingStartDate, customFee,
// paymentPlan }], firstPayment: { paidDate, slip } }
exports.createStudent = async (req, res, next) => {
  try {
    reply(res, await saveStudent({ student: new Student(), body: { ...req.body } }));
  } catch (err) {
    next(err);
  }
};

// PUT /api/students/:id  { ...details, enrollments: [{ id?, batchId, ..., status }],
// firstPayment? } — firstPayment is needed only when a batch is added.
exports.updateStudent = async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id).catch(() => null);
    if (!student) return res.status(404).json({ message: "Student not found" });
    reply(res, await saveStudent({ student, body: { ...req.body } }));
  } catch (err) {
    next(err);
  }
};

// PUT /api/students/:id/registration  — same body as updating, plus `paymentIds` (the
// registration receipts just issued) and firstPayment's paid date (and a new slip, if one is
// attached). Puts right a registration just entered: the student's details and those receipts
// both change, so Payment History shows the same.
exports.correctRegistration = async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id).catch(() => null);
    if (!student) return res.status(404).json({ message: "Student not found" });
    if (!req.body || !req.body.firstPayment) return res.status(400).json({ message: "Enter the paid date from the slip." });
    reply(res, await saveStudent({ student, body: { ...req.body }, correcting: true }));
  } catch (err) {
    next(err);
  }
};

exports.deleteStudent = async (req, res, next) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    if (!student) return res.status(404).json({ message: "Student not found" });
    res.json({ message: "Student deleted" });
  } catch (err) {
    next(err);
  }
};

exports.addStrike = async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: "Student not found" });
    student.strikes = Math.min(3, student.strikes + 1);
    if (student.strikes >= 3) student.status = "Expelled";
    await student.save();
    res.json(studentJSON(student));
  } catch (err) {
    next(err);
  }
};

exports.removeStrike = async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: "Student not found" });
    student.strikes = Math.max(0, student.strikes - 1);
    await student.save();
    res.json(studentJSON(student));
  } catch (err) {
    next(err);
  }
};
