const Student = require("../models/Student");
const Batch = require("../models/Batch");
const Settings = require("../models/Settings");
const PaymentHistory = require("../models/PaymentHistory");
const { readSlipPayload, withoutSlipImage } = require("../utils/slip");
const { billingAnchor, normalizePlan, chargeAt, addMonths, currentMonthKey, feeFor, planOf } = require("../utils/billing");

// All an operator gets of a student: who they are, which batch, and how to reach them.
// Status rides along so the page can still filter to active students. Fees, payment plans,
// billing dates and the guardian contact finance invoices are left out.
const OPERATOR_STUDENT_FIELDS = "name nameBurmese batchId status parentPhone telegram";

exports.getStudents = async (req, res, next) => {
  try {
    const query = Student.find().sort({ name: 1 });
    if (req.user.role === "operator") query.select(OPERATOR_STUDENT_FIELDS);
    const students = await query;
    res.json(students);
  } catch (err) {
    next(err);
  }
};

// GET /api/students/new-per-month — who enrolled each month, newest month first, and which
// batch they joined. Everyone who enrolled counts, whatever their status is now; a student
// who was deleted is gone from the records and so from these lists. Months with no one new
// stay in the list with an empty roster.
//
// Money is the owner's alone, so it is only ever read and worked out for the owner. Each
// student then carries either `monthlyFee` or, on an installment plan, `installments`
// ({ count, total }) — an installment plan has no monthly figure.
exports.getNewStudentsPerMonth = async (req, res, next) => {
  try {
    const withMoney = req.user.role === "owner";
    const [students, batches, settings] = await Promise.all([
      Student.find()
        .select(`name nameBurmese batchId status enrolledDate${withMoney ? " customFee paymentPlan" : ""}`)
        .sort({ enrolledDate: -1, name: 1 })
        .lean(),
      Batch.find().select(withMoney ? "name fee" : "name").lean(),
      withMoney ? Settings.findOne().lean() : null,
    ]);
    const batchById = Object.fromEntries(batches.map((b) => [String(b._id), b]));

    const byMonth = {};
    for (const student of students) {
      if (!/^\d{4}-(0[1-9]|1[0-2])/.test(student.enrolledDate || "")) continue;
      const batch = batchById[student.batchId];
      const entry = {
        id: String(student._id),
        name: student.name,
        nameBurmese: student.nameBurmese || "",
        batchId: batch ? student.batchId : "",
        batchName: batch ? batch.name : "",
        status: student.status,
        enrolledDate: student.enrolledDate,
      };
      if (withMoney) {
        const plan = planOf(student);
        if (plan.kind === "installments") {
          entry.installments = {
            count: plan.installments.length,
            total: plan.installments.reduce((sum, i) => sum + i.amount, 0),
          };
        } else {
          entry.monthlyFee = feeFor(student, batch, settings);
        }
      }
      const month = student.enrolledDate.slice(0, 7);
      (byMonth[month] = byMonth[month] || []).push(entry);
    }

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

// Registering a student is also the first payment, so it needs the same evidence as any
// other: the KBZPay slip for the transfer and the date read off it. The fee lands in
// payment history as a "registration" payment covering the plan's first payment — the first
// month, or the first installment — which is what lets invoicing start from the second.
exports.createStudent = async (req, res, next) => {
  try {
    const { firstPayment, removedCharges, ...studentData } = req.body || {};

    const { error, paidDate, slip } = readSlipPayload(firstPayment, "a student can be registered");
    if (error) return res.status(400).json({ message: error });

    if (!studentData.billingStartDate && !studentData.enrolledDate) studentData.billingStartDate = paidDate;
    const planCheck = normalizePlan(studentData.paymentPlan, billingAnchor(studentData));
    if (planCheck.error) return res.status(400).json({ message: planCheck.error });
    studentData.paymentPlan = planCheck.plan;

    const student = await Student.create(studentData);

    const [settings, batch] = await Promise.all([
      Settings.findOne(),
      student.batchId ? Batch.findById(student.batchId).catch(() => null) : null,
    ]);

    const charge = chargeAt(student, batch, settings, 0);

    // The receipt wants a reference, and taking the next invoice number keeps every document
    // the centre hands out unique — there is simply no Invoice behind this one.
    let reference = "";
    if (settings) {
      reference = `${settings.invoicePrefix}-${settings.nextInvoiceNum}`;
      settings.nextInvoiceNum += 1;
      await settings.save();
    }

    const payment = await PaymentHistory.create({
      studentId: student.id,
      studentName: student.name,
      studentEmail: student.email || "",
      nameBurmese: student.nameBurmese || "",
      batchId: student.batchId || "",
      batchName: batch ? batch.name : "—",
      invoiceNumber: reference,
      amount: charge.amount,
      paidDate,
      periodStart: charge.periodStart,
      periodEnd: charge.periodEnd,
      label: charge.label,
      kind: "registration",
      // Numbered 0 so it sits before the invoice payments without renumbering them.
      paymentCount: 0,
      notes: charge.label ? `Registration — ${charge.label.toLowerCase()}` : "Registration — first month",
      slip,
    });

    res.status(201).json({ student, payment: withoutSlipImage(payment) });
  } catch (err) {
    next(err);
  }
};

exports.updateStudent = async (req, res, next) => {
  try {
    const update = { ...req.body };
    // Deleted invoices are managed by the owner through the dues endpoints; a student form
    // opened before a deletion must not quietly bring the invoice back on save.
    delete update.removedCharges;
    // The plan is checked against the billing date it will have after this save, so the
    // first installment follows a moved billing date.
    if (update.paymentPlan !== undefined) {
      const existing = await Student.findById(req.params.id).catch(() => null);
      if (!existing) return res.status(404).json({ message: "Student not found" });
      const anchor = billingAnchor({
        billingStartDate: update.billingStartDate !== undefined ? update.billingStartDate : existing.billingStartDate,
        enrolledDate: update.enrolledDate !== undefined ? update.enrolledDate : existing.enrolledDate,
      });
      const planCheck = normalizePlan(update.paymentPlan, anchor);
      if (planCheck.error) return res.status(400).json({ message: planCheck.error });
      update.paymentPlan = planCheck.plan;
    }

    const student = await Student.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!student) return res.status(404).json({ message: "Student not found" });
    res.json(student);
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
    res.json(student);
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
    res.json(student);
  } catch (err) {
    next(err);
  }
};
