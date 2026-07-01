const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true },
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    studentEmail: { type: String, default: "" },
    batchId: { type: String, default: "" },
    batchName: { type: String, default: "" },
    monthKey: { type: String, default: "" },
    periodStart: { type: String, default: "" },
    periodEnd: { type: String, default: "" },
    issueDate: { type: String },
    dueDate: { type: String },
    amount: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    status: { type: String, enum: ["Unpaid", "Paid", "Overdue"], default: "Unpaid" },
    paidDate: { type: String, default: null },
    items: [{ desc: String, qty: Number, rate: Number }],
    notes: { type: String, default: "" },
  },
  { toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

module.exports = mongoose.model("Invoice", invoiceSchema);
