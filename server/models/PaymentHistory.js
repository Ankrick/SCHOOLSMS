const mongoose = require("mongoose");

// The KBZPay screenshot that evidences a payment. An invoice cannot be marked paid
// without one (see invoiceController.markPaid); the paid date beside it is typed in from
// the slip by whoever records the payment, never taken from the clock. `image` is a data
// URL and is deliberately left out of list responses — fetch it per record via
// GET /api/payment-history/:id/slip.
const slipSchema = new mongoose.Schema(
  {
    image: { type: String, default: "" },
    filename: { type: String, default: "" },
    attachedAt: { type: String, default: "" },
  },
  { _id: false }
);

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
    // "registration" is the fee collected when the student was enrolled: it covers the
    // first billing period and is numbered 0, leaving invoice payments to run 1, 2, 3…
    kind: { type: String, enum: ["invoice", "registration"], default: "invoice" },
    paymentCount: { type: Number, default: 1 },
    // Where the payment sits in the student's plan — "Month 3 of 6", "Installment 2 of 3" —
    // so receipts can say so. Empty for open-ended monthly billing, and for installments
    // periodEnd is empty too: an installment is due on a date, it does not cover a month.
    label: { type: String, default: "" },
    notes: { type: String, default: "" },
    slip: { type: slipSchema, default: () => ({}) },
  },
  { toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

module.exports = mongoose.model("PaymentHistory", paymentHistorySchema);
