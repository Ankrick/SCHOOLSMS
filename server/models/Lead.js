const mongoose = require("mongoose");

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    source: { type: String, default: "Facebook DM" },
    stage: {
      type: String,
      enum: ["Prospect", "Lead", "Customer", "Raving Fan"],
      default: "Prospect",
    },
    notes: { type: String, default: "" },
    createdAt: { type: String, default: () => new Date().toISOString().split("T")[0] },
    updatedAt: { type: String, default: () => new Date().toISOString().split("T")[0] },
    followUpDate: { type: String, default: "" },
    interestLevel: { type: String, enum: ["High", "Medium", "Low"], default: "Medium" },
    parentName: { type: String, default: "" },
    parentPhone: { type: String, default: "" },
    convertedStudentId: { type: String, default: null },
  },
  { toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

module.exports = mongoose.model("Lead", leadSchema);
