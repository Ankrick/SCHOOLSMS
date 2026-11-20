// A student is one person; each batch they attend is an enrollment with its own billing —
// batch, billing date, fee, payment plan and deleted invoices — and its own status, so a
// student can leave one batch and stay in another.
//
// Records saved before enrollments existed carry one batch's billing on the student itself.
// They are read as a single enrollment whose id is the student's own id, so every payment
// already on record still finds its batch, and nothing has to be rewritten for the app to
// work. The first save through the new form, or scripts/merge-duplicate-students.js, moves
// those fields into `enrollments`.

const mongoose = require("mongoose");

// The per-batch fields that used to live on the student.
const LEGACY_FIELDS = ["batchId", "customFee", "paymentPlan", "billingStartDate", "removedCharges"];

const plain = (v) => (v && typeof v.toObject === "function" ? v.toObject() : v);
const idOf = (doc) => String(doc._id || doc.id);

function enrollmentsOf(student) {
  const list = student.enrollments || [];
  if (list.length) {
    return list.map((e) => ({
      id: idOf(e),
      batchId: e.batchId || "",
      enrolledDate: e.enrolledDate || "",
      billingStartDate: e.billingStartDate || "",
      customFee: e.customFee ?? null,
      paymentPlan: plain(e.paymentPlan) || { kind: "monthly", months: null, installments: [] },
      removedCharges: [...(e.removedCharges || [])],
      status: e.status || "Active",
    }));
  }
  return [{
    id: idOf(student),
    batchId: student.batchId || "",
    enrolledDate: student.enrolledDate || "",
    billingStartDate: student.billingStartDate || "",
    customFee: student.customFee ?? null,
    paymentPlan: plain(student.paymentPlan) || { kind: "monthly", months: null, installments: [] },
    removedCharges: [...(student.removedCharges || [])],
    status: "Active",
  }];
}

// What billing.js works on: one enrollment, wearing the student's name. Billed only while
// both the student and this enrollment are active.
function billingSubject(student, enrollment) {
  return {
    id: idOf(student),
    enrollmentId: enrollment.id,
    name: student.name,
    nameBurmese: student.nameBurmese || "",
    email: student.email || "",
    batchId: enrollment.batchId,
    customFee: enrollment.customFee,
    paymentPlan: enrollment.paymentPlan,
    billingStartDate: enrollment.billingStartDate,
    enrolledDate: enrollment.enrolledDate,
    removedCharges: enrollment.removedCharges,
    status: student.status === "Active" && enrollment.status === "Active" ? "Active" : "Inactive",
  };
}

// Which enrollment a payment belongs to. Payments recorded since enrollments carry it; older
// ones belong to the enrollment that was their student record, or failing that the one in
// their batch, or the student's first.
function enrollmentIdOfPayment(payment, student) {
  if (payment.enrollmentId) return payment.enrollmentId;
  if (!student) return String(payment.studentId);
  const list = enrollmentsOf(student);
  const own = list.find((e) => e.id === String(payment.studentId));
  if (own) return own.id;
  const sameBatch = list.find((e) => e.batchId && e.batchId === payment.batchId);
  return (sameBatch || list[0]).id;
}

// Moves a legacy record's billing into `enrollments` on the document (not yet saved).
function materialize(studentDoc) {
  if (studentDoc.enrollments && studentDoc.enrollments.length) return studentDoc;
  studentDoc.enrollments = enrollmentsOf(studentDoc).map(({ id, ...e }) => ({ _id: new mongoose.Types.ObjectId(id), ...e }));
  for (const f of LEGACY_FIELDS) studentDoc.set(f, undefined);
  return studentDoc;
}

// A student as the API sends it: always with `enrollments`, never the legacy fields.
function studentJSON(student) {
  const json = typeof student.toJSON === "function" ? student.toJSON() : { ...student };
  for (const f of LEGACY_FIELDS) delete json[f];
  delete json._id;
  json.id = idOf(student);
  json.enrollments = enrollmentsOf(student);
  return json;
}

module.exports = { LEGACY_FIELDS, enrollmentsOf, billingSubject, enrollmentIdOfPayment, materialize, studentJSON };
