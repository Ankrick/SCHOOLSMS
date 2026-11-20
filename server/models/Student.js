const mongoose = require("mongoose");

// How a student pays. "monthly" bills customFee (or the batch fee) every month from the
// billing date — for `months` months when set, otherwise until the batch's exam, which is
// how every student was billed before plans existed. "installments" bills exactly the
// listed payments on their own dates; the first is always the billing date, because it is
// the one collected at registration. See utils/billing.js.
const installmentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: String, required: true },
  },
  { _id: false }
);

const paymentPlanSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["monthly", "installments"], default: "monthly" },
    months: { type: Number, default: null, min: 1 },
    installments: { type: [installmentSchema], default: [] },
  },
  { _id: false }
);

// One batch a student attends, with that batch's billing. A student in two batches has two.
// The id of an enrollment that came from an older one-batch student record is that record's
// id, which is how payments recorded before enrollments still find it (utils/enrollments.js).
const enrollmentSchema = new mongoose.Schema({
  batchId: { type: String, default: "" },
  // The day they joined this batch — the date their first payment for it was made.
  enrolledDate: { type: String, default: "" },
  billingStartDate: { type: String, default: "" },
  customFee: { type: Number, default: null },
  paymentPlan: { type: paymentPlanSchema, default: () => ({}) },
  // Period starts the owner deleted from this enrollment's invoices; see removedCharges below.
  removedCharges: { type: [String], default: [] },
  // "Inactive" when the student has left this batch but not the centre.
  status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
});

const studentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, default: "" },
    phone: { type: String, default: "" },
    // Each batch the student attends. Records from before enrollments keep their one batch's
    // billing in the fields marked "legacy" below and are read as one enrollment.
    enrollments: { type: [enrollmentSchema], default: [] },
    // Legacy: one batch's billing on the student itself (see enrollments).
    batchId: { type: String, default: undefined },
    subject: { type: String, default: "Computer Science" },
    status: { type: String, enum: ["Active", "Inactive", "Expelled"], default: "Active" },
    strikes: { type: Number, default: 0, min: 0, max: 3 },
    // When they first joined the centre — their earliest enrollment.
    enrolledDate: { type: String, default: () => new Date().toISOString().split("T")[0] },
    // Legacy, see enrollments.
    billingStartDate: { type: String, default: undefined },
    customFee: { type: Number, default: undefined },
    paymentPlan: { type: paymentPlanSchema, default: undefined },
    // Period starts the owner deleted from this student's invoices. Billing is derived from
    // the plan, so a deleted invoice is remembered as an exception to it rather than as a
    // document removed. Changed only through /api/dues/remove and /restore.
    removedCharges: { type: [String], default: undefined },
    // Who the finance team contacts to send an invoice. Replaces the old parentName +
    // parentFacebook pair in the UI; both are kept below so no existing data is lost.
    invoiceContact: { type: String, default: "" },
    parentName: { type: String, default: "" },
    parentPhone: { type: String, default: "" },
    parentFacebook: { type: String, default: "" },
    nameBurmese: { type: String, default: "" },
    telegram: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

module.exports = mongoose.model("Student", studentSchema);
