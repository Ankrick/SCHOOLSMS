const Lead = require("../models/Lead");
const Student = require("../models/Student");
const Batch = require("../models/Batch");

const today = () => new Date().toISOString().split("T")[0];

exports.getLeads = async (req, res, next) => {
  try {
    const leads = await Lead.find().sort({ updatedAt: -1 });
    res.json(leads);
  } catch (err) {
    next(err);
  }
};

exports.createLead = async (req, res, next) => {
  try {
    const lead = await Lead.create(req.body);
    res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
};

exports.updateLead = async (req, res, next) => {
  try {
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: today() },
      { new: true, runValidators: true }
    );
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    res.json(lead);
  } catch (err) {
    next(err);
  }
};

exports.deleteLead = async (req, res, next) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    res.json({ message: "Lead deleted" });
  } catch (err) {
    next(err);
  }
};

exports.convertToStudent = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const firstBatch = await Batch.findOne();
    const student = await Student.create({
      name: lead.name,
      email: lead.email || "",
      phone: lead.phone || "",
      batchId: firstBatch ? firstBatch.id : "",
      subject: "Computer Science",
      status: "Active",
      strikes: 0,
      enrolledDate: today(),
      parentName: lead.parentName || "",
      parentPhone: lead.parentPhone || "",
      notes: `Converted from CRM lead. Source: ${lead.source}`,
    });

    lead.stage = "Customer";
    lead.convertedStudentId = student.id;
    lead.updatedAt = today();
    await lead.save();

    res.json({ student, lead });
  } catch (err) {
    next(err);
  }
};
