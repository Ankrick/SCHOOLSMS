const mongoose = require("mongoose");

const paymentHistorySchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    studentEmail: { type: String, default: "" },
    nameBurmese: { type: String, default: "" },
    batchId: { type: String, default: "" },
    batchName: { type: String, default: "" },
    invoiceNumber: { type: String, default: "" },
    amount: { type: Number, required: true },
    paidDate: { type: String, required: true },
    periodStart: { type: String, default: "" },
    periodEnd: { type: String, default: "" },
    paymentCount: { type: Number, default: 1 },
    notes: { type: String, default: "" },
  },
  { toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

module.exports = mongoose.model("PaymentHistory", paymentHistorySchema);
