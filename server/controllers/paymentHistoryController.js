const PaymentHistory = require("../models/PaymentHistory");
const Student = require("../models/Student");
const { enrollmentIdOfPayment } = require("../utils/enrollments");

exports.getPaymentHistory = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.studentId) filter.studentId = req.query.studentId;
    if (req.query.batchId) filter.batchId = req.query.batchId;
    // The attached slip image is a data URL worth ~150 KB a row, which would dwarf the
    // rest of the list. Everything else about the slip stays, so the table can still show
    // that one is on file; the image itself is fetched per record by getSlip below.
    const [history, students] = await Promise.all([
      PaymentHistory.find(filter).select("-slip.image").sort({ paidDate: -1 }),
      Student.find().select("batchId enrollments._id enrollments.batchId"),
    ]);
    // Every payment names the enrollment (batch) it paid for — worked out here for payments
    // recorded before enrollments, so screens can match them without knowing the old rule.
    const studentById = Object.fromEntries(students.map((s) => [s.id, s]));
    res.json(history.map((p) => ({ ...p.toJSON(), enrollmentId: enrollmentIdOfPayment(p, studentById[p.studentId]) })));
  } catch (err) {
    next(err);
  }
};

exports.getPaymentSlip = async (req, res, next) => {
  try {
    const record = await PaymentHistory.findById(req.params.id).select("slip");
    if (!record) return res.status(404).json({ message: "Payment record not found" });
    if (!record.slip || !record.slip.image) {
      return res.status(404).json({ message: "No payment slip is attached to this record." });
    }
    res.json(record.slip);
  } catch (err) {
    next(err);
  }
};

exports.updatePaymentHistory = async (req, res, next) => {
  try {
    const { paidDate } = req.body;
    if (!paidDate) return res.status(400).json({ message: "paidDate is required" });

    const record = await PaymentHistory.findByIdAndUpdate(
      req.params.id,
      { paidDate },
      { new: true, runValidators: true }
    );
    if (!record) return res.status(404).json({ message: "Payment record not found" });
    res.json(record);
  } catch (err) {
    next(err);
  }
};

exports.deletePaymentHistory = async (req, res, next) => {
  try {
    const record = await PaymentHistory.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ message: "Payment record not found" });

    // Nothing else to undo: dues are derived, so removing the payment simply puts that
    // period back on the books as unpaid.
    res.json({ deleted: record });
  } catch (err) {
    next(err);
  }
};
