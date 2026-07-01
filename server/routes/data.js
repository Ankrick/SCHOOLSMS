const express = require("express");
const router = express.Router();
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const Batch = require("../models/Batch");
const Invoice = require("../models/Invoice");
const Lead = require("../models/Lead");
const Settings = require("../models/Settings");
const PaymentHistory = require("../models/PaymentHistory");

const DEFAULT_BATCHES = [
  { name: "CIE 0478 — Sat/Mon", syllabus: "CIE", days: "Sat & Mon", maxStudents: 15, fee: 180000 },
  { name: "Edexcel 4CP0 Batch 3 — Wed/Sun", syllabus: "Edexcel", days: "Wed & Sun", maxStudents: 15, fee: 180000 },
  { name: "CIE Oct/Nov 2026 — Wed/Thu", syllabus: "CIE", days: "Wed & Thu", maxStudents: 15, fee: 180000 },
];

// DELETE /api/data/reset
router.delete("/reset", async (req, res, next) => {
  try {
    await Promise.all([
      Student.deleteMany({}),
      Teacher.deleteMany({}),
      Batch.deleteMany({}),
      Invoice.deleteMany({}),
      Lead.deleteMany({}),
      Settings.deleteMany({}),
      PaymentHistory.deleteMany({}),
    ]);
    const [batches, settings] = await Promise.all([
      Batch.insertMany(DEFAULT_BATCHES),
      Settings.create({
        defaultFee: 180000,
        currency: "MMK",
        autoInvoiceDay: 1,
        invoicePrefix: "TLC",
        nextInvoiceNum: 1001,
      }),
    ]);
    res.json({ students: [], teachers: [], batches, invoices: [], leads: [], settings, paymentHistory: [] });
  } catch (err) {
    next(err);
  }
});

// POST /api/data/import
router.post("/import", async (req, res, next) => {
  try {
    const { students = [], teachers = [], batches = [], invoices = [], leads = [], settings, paymentHistory = [] } = req.body;

    await Promise.all([
      Student.deleteMany({}),
      Teacher.deleteMany({}),
      Batch.deleteMany({}),
      Invoice.deleteMany({}),
      Lead.deleteMany({}),
      Settings.deleteMany({}),
      PaymentHistory.deleteMany({}),
    ]);

    const strip = ({ id, _id, __v, ...rest }) => rest;

    const newTeachers = teachers.length ? await Teacher.insertMany(teachers.map(strip)) : [];

    const newBatches = batches.length ? await Batch.insertMany(batches.map(strip)) : [];
    const batchIdMap = {};
    batches.forEach((b, i) => { if (b.id && newBatches[i]) batchIdMap[b.id] = newBatches[i].id; });

    const mappedStudents = students.map((s) => ({
      ...strip(s),
      batchId: batchIdMap[s.batchId] || s.batchId || "",
    }));
    const newStudents = mappedStudents.length ? await Student.insertMany(mappedStudents) : [];
    const studentIdMap = {};
    students.forEach((s, i) => { if (s.id && newStudents[i]) studentIdMap[s.id] = newStudents[i].id; });

    const mappedInvoices = invoices.map((inv) => ({
      ...strip(inv),
      studentId: studentIdMap[inv.studentId] || inv.studentId || "",
      batchId: batchIdMap[inv.batchId] || inv.batchId || "",
    }));
    const mappedLeads = leads.map((l) => ({
      ...strip(l),
      convertedStudentId: l.convertedStudentId
        ? studentIdMap[l.convertedStudentId] || l.convertedStudentId
        : null,
    }));
    const mappedHistory = paymentHistory.map((ph) => ({
      ...strip(ph),
      studentId: studentIdMap[ph.studentId] || ph.studentId || "",
      batchId: batchIdMap[ph.batchId] || ph.batchId || "",
    }));

    const [newInvoices, newLeads, newSettings, newHistory] = await Promise.all([
      mappedInvoices.length ? Invoice.insertMany(mappedInvoices) : [],
      mappedLeads.length ? Lead.insertMany(mappedLeads) : [],
      Settings.create(
        settings
          ? strip(settings)
          : { defaultFee: 180000, currency: "MMK", autoInvoiceDay: 1, invoicePrefix: "TLC", nextInvoiceNum: 1001 }
      ),
      mappedHistory.length ? PaymentHistory.insertMany(mappedHistory) : [],
    ]);

    res.json({
      students: newStudents,
      teachers: newTeachers,
      batches: newBatches,
      invoices: newInvoices,
      leads: newLeads,
      settings: newSettings,
      paymentHistory: newHistory,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
