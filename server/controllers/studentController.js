const Student = require("../models/Student");
const Batch = require("../models/Batch");
const Settings = require("../models/Settings");
const PaymentHistory = require("../models/PaymentHistory");
const { readSlipPayload, withoutSlipImage } = require("../utils/slip");
const { billingAnchor, normalizePlan, chargeAt } = require("../utils/billing");

exports.getStudents = async (req, res, next) => {
  try {
    const students = await Student.find().sort({ name: 1 });
    res.json(students);
  } catch (err) {
    next(err);
  }
};

// Registering a student is also the first payment, so it needs the same evidence as any
// other: the KBZPay slip for the transfer and the date read off it. The fee lands in
// payment history as a "registration" payment covering the plan's first payment — the first
// month, or the first installment — which is what lets invoicing start from the second.
exports.createStudent = async (req, res, next) => {
  try {
    const { firstPayment, ...studentData } = req.body || {};

    const { error, paidDate, slip } = readSlipPayload(firstPayment, "a student can be registered");
    if (error) return res.status(400).json({ message: error });

    if (!studentData.billingStartDate && !studentData.enrolledDate) studentData.billingStartDate = paidDate;
    const planCheck = normalizePlan(studentData.paymentPlan, billingAnchor(studentData));
    if (planCheck.error) return res.status(400).json({ message: planCheck.error });
    studentData.paymentPlan = planCheck.plan;

    const student = await Student.create(studentData);

    const [settings, batch] = await Promise.all([
      Settings.findOne(),
      student.batchId ? Batch.findById(student.batchId).catch(() => null) : null,
    ]);

    const charge = chargeAt(student, batch, settings, 0);

    // The receipt wants a reference, and taking the next invoice number keeps every document
    // the centre hands out unique — there is simply no Invoice behind this one.
    let reference = "";
    if (settings) {
      reference = `${settings.invoicePrefix}-${settings.nextInvoiceNum}`;
      settings.nextInvoiceNum += 1;
      await settings.save();
    }

    const payment = await PaymentHistory.create({
      studentId: student.id,
      studentName: student.name,
      studentEmail: student.email || "",
      nameBurmese: student.nameBurmese || "",
      batchId: student.batchId || "",
      batchName: batch ? batch.name : "—",
      invoiceNumber: reference,
      amount: charge.amount,
      paidDate,
      periodStart: charge.periodStart,
      periodEnd: charge.periodEnd,
      label: charge.label,
      kind: "registration",
      // Numbered 0 so it sits before the invoice payments without renumbering them.
      paymentCount: 0,
      notes: charge.label ? `Registration — ${charge.label.toLowerCase()}` : "Registration — first month",
      slip,
    });

    res.status(201).json({ student, payment: withoutSlipImage(payment) });
  } catch (err) {
    next(err);
  }
};

exports.updateStudent = async (req, res, next) => {
  try {
    const update = { ...req.body };
    // The plan is checked against the billing date it will have after this save, so the
    // first installment follows a moved billing date.
    if (update.paymentPlan !== undefined) {
      const existing = await Student.findById(req.params.id).catch(() => null);
      if (!existing) return res.status(404).json({ message: "Student not found" });
      const anchor = billingAnchor({
        billingStartDate: update.billingStartDate !== undefined ? update.billingStartDate : existing.billingStartDate,
        enrolledDate: update.enrolledDate !== undefined ? update.enrolledDate : existing.enrolledDate,
      });
      const planCheck = normalizePlan(update.paymentPlan, anchor);
      if (planCheck.error) return res.status(400).json({ message: planCheck.error });
      update.paymentPlan = planCheck.plan;
    }

    const student = await Student.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!student) return res.status(404).json({ message: "Student not found" });
    res.json(student);
  } catch (err) {
    next(err);
  }
};

exports.deleteStudent = async (req, res, next) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    if (!student) return res.status(404).json({ message: "Student not found" });
    res.json({ message: "Student deleted" });
  } catch (err) {
    next(err);
  }
};

exports.addStrike = async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: "Student not found" });
    student.strikes = Math.min(3, student.strikes + 1);
    if (student.strikes >= 3) student.status = "Expelled";
    await student.save();
    res.json(student);
  } catch (err) {
    next(err);
  }
};

exports.removeStrike = async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: "Student not found" });
    student.strikes = Math.max(0, student.strikes - 1);
    await student.save();
    res.json(student);
  } catch (err) {
    next(err);
  }
};
