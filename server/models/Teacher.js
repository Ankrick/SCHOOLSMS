const mongoose = require("mongoose");

const teacherSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, default: "" },
    phone: { type: String, default: "" },
    subject: { type: String, default: "Computer Science" },
    monthlySalary: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    joinDate: { type: String, default: () => new Date().toISOString().split("T")[0] },
    notes: { type: String, default: "" },
  },
  { toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

module.exports = mongoose.model("Teacher", teacherSchema);
