// Billing is a schedule, not a pile of documents.
//
// Every active student has a billing anchor — billingStartDate, falling back to enrolledDate
// — and owes their class fee for one month starting on that day, every month, until their
// batch's exam session. That is enough to say what any month costs without anything being
// "generated" first: this month's dues, next month's, or a year out for forecasting. What is
// actually stored is the other half — a PaymentHistory row per period settled. A period is
// paid when a row exists for it and unpaid when one does not.
//
// Period indexes count from the anchor: index 0 is the month collected at registration, index
// 1 the first monthly fee after that, and so on. Index 0 is never billed — its slip was taken
// at sign-up, so charging for it again would be asking twice — which makes index 1 the first
// thing a student is ever invoiced for. A payment's `paymentCount` is its period index, which
// is why it survives payments being made out of order.
//
// A student's paymentPlan shapes that schedule. "monthly" is the above, optionally capped at
// a set number of months instead of running to the exam. "installments" replaces the
// monthly cadence with a fixed list of payments on their own dates — index 0 is still the
// one collected at registration, so the first installment is never invoiced either.

const EXAM_SESSION_MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const today = () => new Date().toISOString().split("T")[0];
const currentMonthKey = () => today().slice(0, 7);

// Add `n` calendar months, clamping to the last valid day: Jan 31 + 1 → Feb 28, not Mar 3.
// Always applied to the anchor with an absolute index, never stepped month by month, so a
// clamped month cannot drag every later period back with it.
function addMonths(dateStr, n) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const total = year * 12 + (month - 1) + n;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  const lastDay = new Date(newYear, newMonth, 0).getDate();
  const d = Math.min(day, lastDay);
  return `${newYear}-${String(newMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Batches name an exam session as free text like "May/June 2027" or "Oct/Nov 2026". Billing
// runs up to and including the FIRST month named; an explicit exam date is the fallback.
function examCutoffMonth(batch) {
  if (!batch) return null;
  if (batch.examSession) {
    const yearMatch = batch.examSession.match(/\d{4}/);
    const firstWord = batch.examSession.split(/[\s/,-]+/)[0];
    const monthNum = firstWord ? EXAM_SESSION_MONTHS[firstWord.toLowerCase()] : null;
    if (yearMatch && monthNum) return `${yearMatch[0]}-${String(monthNum).padStart(2, "0")}`;
  }
  return batch.examDate ? batch.examDate.slice(0, 7) : null;
}

const billingAnchor = (student) => student.billingStartDate || student.enrolledDate || "";

// A student's own fee where they have one — including a deliberate 0 — else the batch's.
const feeFor = (student, batch, settings) => {
  if (student.customFee != null) return student.customFee;
  if (batch) return batch.fee;
  return settings ? settings.defaultFee : 0;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_INSTALLMENTS = 24;
const MAX_MONTHS = 60;

// The plan a student is on. Students saved before plans existed have none, and are monthly
// and open-ended — exactly how they have always been billed.
function planOf(student) {
  const plan = student.paymentPlan || {};
  if (plan.kind === "installments" && plan.installments && plan.installments.length) {
    return { kind: "installments", installments: plan.installments };
  }
  return { kind: "monthly", months: plan.months || null };
}

// Check a plan sent from the form and put it in the shape that is stored. The first
// installment is pinned to the billing anchor — it is the payment taken at registration —
// so a changed billing date can never leave it pointing somewhere else.
function normalizePlan(plan, anchor) {
  if (!plan || typeof plan !== "object") return { plan: { kind: "monthly", months: null, installments: [] } };

  if (plan.kind === "installments") {
    const list = Array.isArray(plan.installments) ? plan.installments : [];
    if (list.length < 1 || list.length > MAX_INSTALLMENTS) {
      return { error: `An installment plan needs between 1 and ${MAX_INSTALLMENTS} payments.` };
    }
    if (!anchor || !DATE.test(anchor)) return { error: "Set a billing date before choosing an installment plan." };

    const installments = [];
    for (let i = 0; i < list.length; i++) {
      const amount = Number(list[i] && list[i].amount);
      const dueDate = i === 0 ? anchor : list[i] && list[i].dueDate;
      if (!Number.isFinite(amount) || amount <= 0) {
        return { error: `Enter an amount for payment ${i + 1}.` };
      }
      if (typeof dueDate !== "string" || !DATE.test(dueDate)) {
        return { error: `Enter a due date for payment ${i + 1}.` };
      }
      if (i > 0 && dueDate <= installments[i - 1].dueDate) {
        return { error: `Payment ${i + 1} must fall after payment ${i}.` };
      }
      installments.push({ amount: Math.round(amount), dueDate });
    }
    return { plan: { kind: "installments", months: null, installments } };
  }

  if (plan.months == null || plan.months === "") {
    return { plan: { kind: "monthly", months: null, installments: [] } };
  }
  const months = Number(plan.months);
  if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) {
    return { error: `The number of months must be a whole number from 1 to ${MAX_MONTHS}.` };
  }
  return { plan: { kind: "monthly", months, installments: [] } };
}

// Which period lands in `mk`. Each period starts on the anchor's day-of-month, so exactly
// one begins in every calendar month and the index is plain month arithmetic.
function periodIndexInMonth(anchor, mk) {
  const [ay, am] = anchor.split("-").map(Number);
  const [my, mm] = mk.split("-").map(Number);
  return (my - ay) * 12 + (mm - am);
}

// Inclusive list of "YYYY-MM" from `from` to `to`, capped so a silly range cannot ask the
// server to walk centuries.
function monthRange(from, to, maxMonths = 36) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const span = (ty - fy) * 12 + (tm - fm);
  const months = [];
  for (let i = 0; i <= span && months.length < maxMonths; i++) {
    const total = fy * 12 + (fm - 1) + i;
    months.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`);
  }
  return months;
}

function fmtShortDate(dateStr) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// What the plan charges at period `index`, or null when the plan has no such payment.
// Exam cutoffs are not applied here — they bound which months are billed, not what a
// period is — so a payment recorded before a batch's exam moved still resolves.
function chargeAt(student, batch, settings, index) {
  const anchor = billingAnchor(student);
  if (!anchor || index < 0) return null;
  const plan = planOf(student);

  if (plan.kind === "installments") {
    const inst = plan.installments[index];
    if (!inst) return null;
    const n = plan.installments.length;
    return {
      periodStart: index === 0 ? anchor : inst.dueDate,
      periodEnd: "",
      amount: inst.amount,
      label: n === 1 ? "Full payment" : `Installment ${index + 1} of ${n}`,
    };
  }

  if (plan.months && index >= plan.months) return null;
  return {
    periodStart: addMonths(anchor, index),
    periodEnd: addMonths(anchor, index + 1),
    amount: feeFor(student, batch, settings),
    label: plan.months ? `Month ${index + 1} of ${plan.months}` : "",
  };
}

// The period indexes a student is billed for in calendar month `mk`, before the
// registration period is excluded. Monthly plans have at most one; installments can have
// several if two fall in the same month.
function periodIndexesInMonth(student, batch, mk) {
  const anchor = billingAnchor(student);
  if (!anchor) return [];
  const plan = planOf(student);

  if (plan.kind === "installments") {
    const out = [];
    plan.installments.forEach((inst, i) => {
      const start = i === 0 ? anchor : inst.dueDate;
      if (start.slice(0, 7) === mk) out.push(i);
    });
    return out;
  }

  const index = periodIndexInMonth(anchor, mk);
  if (index < 0) return [];
  if (plan.months) return index < plan.months ? [index] : [];
  // Open-ended monthly billing runs until the batch's exam.
  const cutoff = examCutoffMonth(batch);
  return cutoff && mk > cutoff ? [] : [index];
}

// The charge a student carries for one period. `id` is synthetic and stable — a due has no
// document of its own, so the student and the period it covers are its identity.
function makeDue({ student, batch, settings, index }) {
  const charge = chargeAt(student, batch, settings, index);
  if (!charge) return null;
  const { periodStart, periodEnd, amount, label } = charge;
  const what = label || fmtShortDate(periodStart) + " – " + fmtShortDate(periodEnd);
  return {
    id: `${student.id}:${periodStart}`,
    studentId: student.id,
    studentName: student.name,
    nameBurmese: student.nameBurmese || "",
    studentEmail: student.email || "",
    batchId: student.batchId || "",
    batchName: batch ? batch.name : "—",
    periodIndex: index,
    periodStart,
    periodEnd,
    label,
    monthKey: periodStart.slice(0, 7),
    // Students prepay, so the money is due on the day the period opens.
    dueDate: periodStart,
    amount,
    status: "Unpaid",
    paidDate: null,
    paymentId: null,
    invoiceNumber: "",
    kind: index === 0 ? "registration" : "invoice",
    // One line, so the printable bill a parent is sent renders the same as it always did.
    items: [{ desc: (batch ? batch.name : "Tuition") + " · " + what, qty: 1, rate: amount }],
  };
}

// Is this a real period start for the student, rather than an arbitrary date?
function periodIndexOf(student, periodStart) {
  const anchor = billingAnchor(student);
  if (!anchor) return -1;
  const plan = planOf(student);

  if (plan.kind === "installments") {
    if (periodStart === anchor) return 0;
    return plan.installments.findIndex((inst, i) => i > 0 && inst.dueDate === periodStart);
  }

  const index = periodIndexInMonth(anchor, periodStart.slice(0, 7));
  if (index < 0 || (plan.months && index >= plan.months)) return -1;
  return addMonths(anchor, index) === periodStart ? index : -1;
}

module.exports = {
  today,
  currentMonthKey,
  addMonths,
  examCutoffMonth,
  billingAnchor,
  feeFor,
  planOf,
  normalizePlan,
  chargeAt,
  periodIndexesInMonth,
  periodIndexOf,
  monthRange,
  makeDue,
};
