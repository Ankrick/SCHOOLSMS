const Student = require("../models/Student");
const Batch = require("../models/Batch");
const Settings = require("../models/Settings");
const PaymentHistory = require("../models/PaymentHistory");
const { readSlipPayload, withoutSlipImage } = require("../utils/slip");
const {
  today,
  currentMonthKey,
  unpaidStatus,
  addMonths,
  billingAnchor,
  chargeAt,
  periodIndexesInMonth,
  periodIndexOf,
  isRemoved,
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

    // The schedule: every payment each active student's plan falls due in these months.
    const byKey = new Map();
    for (const student of students) {
      if (student.status !== "Active") continue;
      if (!billingAnchor(student)) continue;
      const batch = batchById[student.batchId];

      for (const mk of months) {
        for (const index of periodIndexesInMonth(student, batch, mk)) {
          // index 0 is the payment taken at registration — the slip was collected then, so
          // billing it again would be asking twice. Charging starts at the second payment.
          if (index < 1) continue;
          const due = makeDue({ student, batch, settings, index });
          if (due && !isRemoved(student, due.periodStart)) byKey.set(due.id, due);
        }
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
        // Installment payments carry a label and deliberately no end; older monthly rows
        // that predate stored ends are a month long.
        periodEnd: ph.periodEnd || (ph.label ? "" : addMonths(ph.periodStart, 1)),
        label: ph.label || "",
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
        : { ...due, status: unpaidStatus(due.dueDate, todayStr) }
    );

    // Reminders go out a few days ahead, so at the end of a month some are for fees due early
    // next month. When the range ends at the current month, those are included — flagged
    // `early` and kept out of the totals, which still describe only the months asked for.
    const nowMk = currentMonthKey();
    if (to === nowMk) {
      const nextMk = addMonths(`${nowMk}-01`, 1).slice(0, 7);
      const upcoming = [];
      for (const student of students) {
        if (student.status !== "Active" || !billingAnchor(student)) continue;
        const batch = batchById[student.batchId];
        for (const index of periodIndexesInMonth(student, batch, nextMk)) {
          if (index < 1) continue;
          const due = makeDue({ student, batch, settings, index });
          if (due && !isRemoved(student, due.periodStart) && unpaidStatus(due.dueDate, todayStr) === "Remind") {
            upcoming.push(due);
          }
        }
      }
      if (upcoming.length) {
        // Anything already paid ahead of time needs no reminder.
        const paidEarly = await PaymentHistory.find({
          $or: upcoming.map((d) => ({ studentId: d.studentId, periodStart: d.periodStart })),
        }).select("studentId periodStart");
        const paidKeys = new Set(paidEarly.map((ph) => `${ph.studentId}:${ph.periodStart}`));
        for (const due of upcoming) {
          if (!paidKeys.has(due.id)) dues.push({ ...due, status: "Remind", early: true });
        }
      }
    }
    dues.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.studentName.localeCompare(b.studentName));

    const inRange = dues.filter((d) => !d.early);
    const collected = inRange.filter((d) => d.status === "Paid").reduce((sum, d) => sum + d.amount, 0);
    const expected = inRange.reduce((sum, d) => sum + d.amount, 0);
    const unpaid = inRange.filter((d) => d.status !== "Paid");

    res.json({
      from,
      to,
      dues,
      totals: {
        expected,
        collected,
        outstanding: expected - collected,
        studentsLeft: new Set(unpaid.map((d) => d.studentId)).size,
        // Past due, whether still at the reminder stage or already needing a call.
        overdue: dues.filter((d) => d.status === "Overdue" || d.status === "Call").length,
        call: dues.filter((d) => d.status === "Call").length,
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
    if (isRemoved(student, periodStart)) {
      return res.status(400).json({ message: `That invoice for ${student.name} was deleted, so it cannot be paid.` });
    }
    if (index === 0) {
      return res.status(400).json({
        message: `${student.name}'s first payment was collected when they were registered, so it is not billed again.`,
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

    // The plan says what this period costs — the client's figure is never trusted.
    const charge = chargeAt(student, batch, settings, index);

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
      periodStart,
      periodEnd: charge.periodEnd,
      label: charge.label,
      // The period's own index, so payments stay correctly numbered however out of order
      // they are recorded. Index 0 never reaches here, so this is never the registration.
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

// Reads [{ studentId, periodStart }] from the body and checks each is a real, invoiceable
// period. Returns { error } or { targets: [{ student, periodStart }] }.
async function readCharges(body) {
  const list = Array.isArray(body && body.charges) ? body.charges : [];
  if (list.length === 0) return { error: "No invoices were given." };
  if (list.length > 500) return { error: "Too many invoices at once." };

  const ids = [...new Set(list.map((c) => String(c && c.studentId)))];
  const students = await Student.find({ _id: { $in: ids } }).catch(() => []);
  const byId = Object.fromEntries(students.map((s) => [s.id, s]));

  const targets = [];
  for (const c of list) {
    const student = byId[c && c.studentId];
    const periodStart = c && c.periodStart;
    if (!student) return { error: "One of those students no longer exists." };
    if (typeof periodStart !== "string" || periodIndexOf(student, periodStart) < 1) {
      return { error: `${student.name} has no invoice starting ${periodStart}.` };
    }
    targets.push({ student, periodStart });
  }
  return { targets };
}

// POST /api/dues/remove  { charges: [{ studentId, periodStart }] }   — owner only
//
// Deletes invoices. A paid invoice is refused: its payment and slip are the record of money
// received, and removing that belongs in Payment History, deliberately, one record at a time.
exports.removeDues = async (req, res, next) => {
  try {
    const { error, targets } = await readCharges(req.body);
    if (error) return res.status(400).json({ message: error });

    const paid = await PaymentHistory.find({
      $or: targets.map((t) => ({ studentId: t.student.id, periodStart: t.periodStart })),
    }).select("studentName periodStart");
    if (paid.length) {
      return res.status(409).json({
        message: `${paid[0].studentName}'s invoice is already paid, so it cannot be deleted here. Remove the payment from Payment History first if it was recorded by mistake.`,
      });
    }

    const updated = await applyToStudents(targets, "$addToSet");
    res.json({ removed: targets.length, students: updated });
  } catch (err) {
    next(err);
  }
};

// POST /api/dues/restore  { charges: [{ studentId, periodStart }] }   — owner only
//
// Undoes a deletion: the period goes back on the student's schedule.
exports.restoreDues = async (req, res, next) => {
  try {
    const { error, targets } = await readCharges(req.body);
    if (error) return res.status(400).json({ message: error });
    const updated = await applyToStudents(targets, "$pull");
    res.json({ restored: targets.length, students: updated });
  } catch (err) {
    next(err);
  }
};

// Adds or pulls the period starts on each student's removedCharges, one write per student,
// and hands back the updated students so the client's copies stay current.
async function applyToStudents(targets, op) {
  const byStudent = new Map();
  for (const { student, periodStart } of targets) {
    if (!byStudent.has(student.id)) byStudent.set(student.id, []);
    byStudent.get(student.id).push(periodStart);
  }
  const updated = [];
  for (const [id, starts] of byStudent) {
    const change = op === "$addToSet"
      ? { $addToSet: { removedCharges: { $each: starts } } }
      : { $pull: { removedCharges: { $in: starts } } };
    updated.push(await Student.findByIdAndUpdate(id, change, { new: true }));
  }
  return updated;
}
