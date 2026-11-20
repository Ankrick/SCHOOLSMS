const express = require("express");
const router = express.Router();
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const Batch = require("../models/Batch");
const Lead = require("../models/Lead");
const Settings = require("../models/Settings");
const PaymentHistory = require("../models/PaymentHistory");
const { enrollmentsOf, enrollmentIdOfPayment, studentJSON, LEGACY_FIELDS } = require("../utils/enrollments");

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
    res.json({ students: [], teachers: [], batches, leads: [], settings, paymentHistory: [] });
  } catch (err) {
    next(err);
  }
});

// POST /api/data/import
router.post("/import", async (req, res, next) => {
  try {
    // `invoices` in an older backup is ignored on purpose: what is owed is derived from the
    // students and what has been collected, so there is nothing to restore.
    const { students = [], teachers = [], batches = [], leads = [], settings, paymentHistory = [] } = req.body;

    await Promise.all([
      Student.deleteMany({}),
      Teacher.deleteMany({}),
      Batch.deleteMany({}),
      Lead.deleteMany({}),
      Settings.deleteMany({}),
      PaymentHistory.deleteMany({}),
    ]);

    const strip = ({ id, _id, __v, ...rest }) => rest;

    const newTeachers = teachers.length ? await Teacher.insertMany(teachers.map(strip)) : [];

    const newBatches = batches.length ? await Batch.insertMany(batches.map(strip)) : [];
    const batchIdMap = {};
    batches.forEach((b, i) => { if (b.id && newBatches[i]) batchIdMap[b.id] = newBatches[i].id; });

    // Enrollments keep their ids, so payments keep pointing at the right batch; only the batch
    // ids they name are renumbered. A backup from before enrollments has one batch per student.
    const OBJECT_ID = /^[a-f0-9]{24}$/;
    const mappedStudents = students.map((s) => {
      const out = strip(s);
      // Read the way the app reads it (old backups included), so a backup's one-batch student
      // becomes an enrollment whose id is the student's old id — the id its payments resolve to.
      out.enrollments = enrollmentsOf(s).map(({ id, ...e }) => ({
        ...e,
        ...(OBJECT_ID.test(id) ? { _id: id } : {}),
        batchId: batchIdMap[e.batchId] || e.batchId || "",
      }));
      for (const f of LEGACY_FIELDS) delete out[f];
      return out;
    });
    const newStudents = mappedStudents.length ? await Student.insertMany(mappedStudents) : [];
    const studentIdMap = {};
    students.forEach((s, i) => { if (s.id && newStudents[i]) studentIdMap[s.id] = newStudents[i].id; });

    const mappedLeads = leads.map((l) => ({
      ...strip(l),
      convertedStudentId: l.convertedStudentId
        ? studentIdMap[l.convertedStudentId] || l.convertedStudentId
        : null,
    }));
    const oldStudentById = Object.fromEntries(students.map((s) => [s.id, s]));
    const mappedHistory = paymentHistory.map((ph) => ({
      ...strip(ph),
      // Settled against the backup's own ids, before the student ids are renumbered.
      enrollmentId: enrollmentIdOfPayment(ph, oldStudentById[ph.studentId]),
      studentId: studentIdMap[ph.studentId] || ph.studentId || "",
      batchId: batchIdMap[ph.batchId] || ph.batchId || "",
    }));

    const [newLeads, newSettings, newHistory] = await Promise.all([
      mappedLeads.length ? Lead.insertMany(mappedLeads) : [],
      Settings.create(
        settings
          ? strip(settings)
          : { defaultFee: 180000, currency: "MMK", autoInvoiceDay: 1, invoicePrefix: "TLC", nextInvoiceNum: 1001 }
      ),
      mappedHistory.length ? PaymentHistory.insertMany(mappedHistory) : [],
    ]);

    res.json({
      students: newStudents.map(studentJSON),
      teachers: newTeachers,
      batches: newBatches,
      leads: newLeads,
      settings: newSettings,
      paymentHistory: newHistory,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
