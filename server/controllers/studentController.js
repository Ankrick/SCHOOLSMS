const Student = require("../models/Student");
const Batch = require("../models/Batch");
const Settings = require("../models/Settings");
const PaymentHistory = require("../models/PaymentHistory");
const { readSlipPayload, withoutSlipImage } = require("../utils/slip");

// Add `n` calendar months to a date, clamping to the last valid day if needed — mirrors
// invoiceController so a registration period lines up with the invoices that follow it.
function addMonths(dateStr, n) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const total = year * 12 + (month - 1) + n;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  const lastDay = new Date(newYear, newMonth, 0).getDate();
  return `${newYear}-${String(newMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

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
// payment history as a "registration" payment covering the first billing period, which is
// what lets the first generated invoice start from the second — the cadence invoicing has
// always assumed, but until now had no record of.
exports.createStudent = async (req, res, next) => {
  try {
    const { firstPayment, ...studentData } = req.body || {};

    const { error, paidDate, slip } = readSlipPayload(firstPayment, "a student can be registered");
    if (error) return res.status(400).json({ message: error });

    const student = await Student.create(studentData);

    const [settings, batch] = await Promise.all([
      Settings.findOne(),
      student.batchId ? Batch.findById(student.batchId).catch(() => null) : null,
    ]);

    const fee =
      student.customFee != null
        ? student.customFee
        : batch
        ? batch.fee
        : settings
        ? settings.defaultFee
        : 0;

    const periodStart = student.billingStartDate || student.enrolledDate || paidDate;

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
      amount: fee,
      paidDate,
      periodStart,
      periodEnd: addMonths(periodStart, 1),
      kind: "registration",
      // Numbered 0 so it sits before the invoice payments without renumbering them.
      paymentCount: 0,
      notes: "Registration — first month",
      slip,
    });

    res.status(201).json({ student, payment: withoutSlipImage(payment) });
  } catch (err) {
    next(err);
  }
};

exports.updateStudent = async (req, res, next) => {
  try {
    const student = await Student.findByIdAndUpdate(req.params.id, req.body, {
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
