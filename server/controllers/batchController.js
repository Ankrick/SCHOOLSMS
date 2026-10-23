const Batch = require("../models/Batch");
const Student = require("../models/Student");

const OPERATOR_BATCH_FIELDS = "name syllabus days maxStudents examSession examDate sessionsPerMonth";

exports.getBatches = async (req, res, next) => {
  try {
    const query = Batch.find().sort({ name: 1 });
    // Operators don't see what a class costs. An allow-list rather than "-fee", because
    // stored batches also carry teacher commission fields the schema doesn't declare.
    if (req.user.role === "operator") query.select(OPERATOR_BATCH_FIELDS);
    const batches = await query;
    res.json(batches);
  } catch (err) {
    next(err);
  }
};

exports.createBatch = async (req, res, next) => {
  try {
    const batch = await Batch.create(req.body);
    res.status(201).json(batch);
  } catch (err) {
    next(err);
  }
};

exports.updateBatch = async (req, res, next) => {
  try {
    const batch = await Batch.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!batch) return res.status(404).json({ message: "Batch not found" });
    res.json(batch);
  } catch (err) {
    next(err);
  }
};

exports.deleteBatch = async (req, res, next) => {
  try {
    const hasStudents = await Student.exists({ batchId: req.params.id });
    if (hasStudents)
      return res
        .status(400)
        .json({ message: "Cannot delete a batch that has enrolled students." });
    const batch = await Batch.findByIdAndDelete(req.params.id);
    if (!batch) return res.status(404).json({ message: "Batch not found" });
    res.json({ message: "Batch deleted" });
  } catch (err) {
    next(err);
  }
};
