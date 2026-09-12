const PaymentHistory = require("../models/PaymentHistory");
const Invoice = require("../models/Invoice");

exports.getPaymentHistory = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.studentId) filter.studentId = req.query.studentId;
    if (req.query.batchId) filter.batchId = req.query.batchId;
    // The attached slip image is a data URL worth ~150 KB a row, which would dwarf the
    // rest of the list. Everything else about the slip stays, so the table can still show
    // that one is on file; the image itself is fetched per record by getSlip below.
    const history = await PaymentHistory.find(filter).select("-slip.image").sort({ paidDate: -1 });
    res.json(history);
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

    // Remove the next invoice that was auto-generated when this payment was recorded.
    // A registration fee never generated one, so it must not go hunting by date and take
    // an unrelated invoice that happens to have been issued the same day.
    const deleted =
      record.kind === "registration"
        ? null
        : await Invoice.findOneAndDelete({
            studentId: record.studentId,
            issueDate: record.paidDate,
          });

    res.json({ deleted: record, deletedInvoiceId: deleted ? deleted.id : null });
  } catch (err) {
    next(err);
  }
};
