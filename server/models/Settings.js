const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
    defaultFee: { type: Number, default: 180000 },
    currency: { type: String, default: "MMK" },
    autoInvoiceDay: { type: Number, default: 1 },
    invoicePrefix: { type: String, default: "TLC" },
    nextInvoiceNum: { type: Number, default: 1001 },
  },
  { toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

module.exports = mongoose.model("Settings", settingsSchema);
