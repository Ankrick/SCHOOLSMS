const mongoose = require("mongoose");

const batchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    syllabus: { type: String, enum: ["CIE", "Edexcel"], default: "CIE" },
    days: { type: String, default: "" },
    maxStudents: { type: Number, default: 15 },
    fee: { type: Number, default: 180000 },
    examSession: { type: String, default: "" },
    examDate: { type: String, default: "" },
    sessionsPerMonth: { type: Number, default: 8 },
  },
  { toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

module.exports = mongoose.model("Batch", batchSchema);
