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

const studentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, default: "" },
    phone: { type: String, default: "" },
    batchId: { type: String, default: "" },
    subject: { type: String, default: "Computer Science" },
    status: { type: String, enum: ["Active", "Inactive", "Expelled"], default: "Active" },
    strikes: { type: Number, default: 0, min: 0, max: 3 },
    enrolledDate: { type: String, default: () => new Date().toISOString().split("T")[0] },
    billingStartDate: { type: String, default: "" },
    customFee: { type: Number, default: null },
    paymentPlan: { type: paymentPlanSchema, default: () => ({}) },
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
