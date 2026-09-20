const Student = require("../models/Student");
const Batch = require("../models/Batch");
const Settings = require("../models/Settings");
const PaymentHistory = require("../models/PaymentHistory");
const { readSlipPayload, withoutSlipImage } = require("../utils/slip");
const {
  today,
  currentMonthKey,
  addMonths,
  examCutoffMonth,
  billingAnchor,
  feeFor,
  periodIndexInMonth,
  periodIndexOf,
  monthRange,
  makeDue,
} = require("../utils/billing");

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

// GET /api/dues?from=YYYY-MM&to=YYYY-MM
//
// What the given months cost and what has been collected against them. Nothing is created
// here: the schedule is derived from each active student's billing anchor, and payments
// already on record are laid over it. Ask for a month years ahead and you get the forecast;
// ask for last month and you get what actually happened.
exports.getDues = async (req, res, next) => {
  try {
    const from = MONTH.test(req.query.from || "") ? req.query.from : currentMonthKey();
    const to = MONTH.test(req.query.to || "") ? req.query.to : from;
    if (to < from) return res.status(400).json({ message: "The end month is before the start month." });

    const months = monthRange(from, to);
    const [students, batches, settings, payments] = await Promise.all([
      Student.find(),
      Batch.find(),
      Settings.findOne(),
      // Payments are matched on the period they cover, not when they were made — a fee paid
      // late still belongs to its own month.
      PaymentHistory.find({
        periodStart: { $gte: `${months[0]}-01`, $lte: `${months[months.length - 1]}-32` },
      }).select("-slip.image"),
    ]);

    const batchById = Object.fromEntries(batches.map((b) => [b.id, b]));
    const studentById = Object.fromEntries(students.map((s) => [s.id, s]));
    const todayStr = today();

    // The schedule: one due per active student per month they are being taught.
    const byKey = new Map();
    for (const student of students) {
      if (student.status !== "Active") continue;
      const anchor = billingAnchor(student);
      if (!anchor) continue;
      const batch = batchById[student.batchId];
      const cutoff = examCutoffMonth(batch);

      for (const mk of months) {
        if (cutoff && mk > cutoff) continue;
        const index = periodIndexInMonth(anchor, mk);
        // index 0 is the month paid for at registration — the slip was taken then, so
        // billing it again would be asking twice. Charging starts at the second month.
        if (index < 1) continue;
        const due = makeDue({ student, batch, settings, index });
        byKey.set(due.id, due);
      }
    }

    // What has been collected against those months. A payment still shows for a student
    // since made inactive or a batch past its exam — otherwise a month's history would
    // quietly shrink. Registration fees are skipped: they belong to a month this page does
    // not bill, and they are on the record under Payment History and Transactions.
    for (const ph of payments) {
      if (ph.kind === "registration") continue;
      const key = `${ph.studentId}:${ph.periodStart}`;
      const due = byKey.get(key) || {
        ...makeDue({
          student: studentById[ph.studentId] || {
            id: ph.studentId, name: ph.studentName, nameBurmese: ph.nameBurmese,
            email: ph.studentEmail, batchId: ph.batchId, billingStartDate: ph.periodStart,
          },
          batch: batchById[ph.batchId],
          settings,
          index: 0,
        }),
        id: key,
        periodStart: ph.periodStart,
        periodEnd: ph.periodEnd || addMonths(ph.periodStart, 1),
        monthKey: ph.periodStart.slice(0, 7),
        dueDate: ph.periodStart,
        periodIndex: ph.paymentCount,
        batchName: ph.batchName || "—",
      };

      byKey.set(key, {
        ...due,
        // The books win over the schedule: a fee settled at a negotiated amount is what was
        // actually charged, whatever the current fee would say.
        amount: ph.amount,
        status: "Paid",
        paidDate: ph.paidDate,
        paymentId: ph.id,
        invoiceNumber: ph.invoiceNumber || "",
        kind: ph.kind || "invoice",
        hasSlip: !!(ph.slip && ph.slip.attachedAt),
      });
    }

    const dues = [...byKey.values()].map((due) =>
      due.status === "Paid"
        ? due
        : { ...due, status: due.dueDate < todayStr ? "Overdue" : "Unpaid" }
    );
    dues.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.studentName.localeCompare(b.studentName));

    const collected = dues.filter((d) => d.status === "Paid").reduce((sum, d) => sum + d.amount, 0);
    const expected = dues.reduce((sum, d) => sum + d.amount, 0);
    const unpaid = dues.filter((d) => d.status !== "Paid");

    res.json({
      from,
      to,
      dues,
      totals: {
        expected,
        collected,
        outstanding: expected - collected,
        studentsLeft: new Set(unpaid.map((d) => d.studentId)).size,
        overdue: dues.filter((d) => d.status === "Overdue").length,
      },
    });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/dues/pay  { studentId, periodStart, paidDate, slip }
//
// Settles one period. There is no invoice to look up or delete — the period is identified by
// the student and the day it starts, and the amount is recomputed here rather than trusted
// from the client.
exports.payDue = async (req, res, next) => {
  try {
    const { error, paidDate, slip } = readSlipPayload(req.body);
    if (error) return res.status(400).json({ message: error });

    const { studentId, periodStart } = req.body || {};
    if (typeof periodStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) {
      return res.status(400).json({ message: "Which period is being paid was not given." });
    }

    const student = await Student.findById(studentId).catch(() => null);
    if (!student) return res.status(404).json({ message: "Student not found" });

    const index = periodIndexOf(student, periodStart);
    if (index < 0) {
      return res.status(400).json({ message: "That is not a billing period for this student." });
    }
    if (index === 0) {
      return res.status(400).json({
        message: `${student.name}'s first month was collected when they were registered, so it is not billed again.`,
      });
    }

    // Paying the same period twice would double-count the month's revenue.
    const already = await PaymentHistory.findOne({ studentId: student.id, periodStart });
    if (already) {
      return res.status(409).json({ message: `${student.name} is already recorded as paid for this period.` });
    }

    const [settings, batch] = await Promise.all([
      Settings.findOne(),
      student.batchId ? Batch.findById(student.batchId).catch(() => null) : null,
    ]);

    // Receipts need a reference, and taking the next number keeps every document the centre
    // hands out unique.
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
      amount: feeFor(student, batch, settings),
      paidDate,
      periodStart,
      periodEnd: addMonths(periodStart, 1),
      // The period's own index, so payments stay correctly numbered however out of order
      // they are recorded. Index 0 never reaches here, so this is always a monthly fee.
      kind: "invoice",
      paymentCount: index,
      notes: "",
      slip,
    });

    res.status(201).json({ payment: withoutSlipImage(payment) });
  } catch (err) {
    next(err);
  }
};
