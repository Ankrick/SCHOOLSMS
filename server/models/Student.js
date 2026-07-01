const mongoose = require("mongoose");

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
