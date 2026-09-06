// One-off fix for open invoices raised before the prepay change.
//
// Students prepay, so an invoice due on 04 Sept covers 04 Sept – 04 Oct. Older invoices
// stored the month *up to* the due date instead (04 Aug – 04 Sept), even though the
// invoice preview already displayed the prepay period. This repoints the stored period to
// match the due date, and re-stamps anything already past due as Overdue.
//
// Due dates are never changed, so the billing cadence is untouched. Only invoices still on
// the books are affected — paid ones live in PaymentHistory and are left alone.
//
//   node scripts/repoint-invoice-periods.js           # dry run
//   node scripts/repoint-invoice-periods.js --apply   # writes the changes

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");

const APPLY = process.argv.includes("--apply");
const today = () => new Date().toISOString().split("T")[0];

function addMonths(dateStr, n) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const total = year * 12 + (month - 1) + n;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  const lastDay = new Date(newYear, newMonth, 0).getDate();
  return `${newYear}-${String(newMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

const fmtShortDate = (d) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const todayStr = today();
  const invoices = await Invoice.find().lean();

  const changes = [];
  for (const inv of invoices) {
    if (!inv.dueDate) continue;
    const periodStart = inv.dueDate;
    const periodEnd = addMonths(periodStart, 1);
    const status = inv.status === "Paid" ? inv.status : periodStart < todayStr ? "Overdue" : "Unpaid";

    const periodMoved = inv.periodStart !== periodStart || inv.periodEnd !== periodEnd;
    const statusMoved = inv.status !== status;
    if (!periodMoved && !statusMoved) continue;

    const label = `${fmtShortDate(periodStart)} – ${fmtShortDate(periodEnd)}`;
    const items = (inv.items || []).map((it) => ({
      ...it,
      desc: it.desc ? it.desc.replace(/ · .+$/, ` · ${label}`) : it.desc,
    }));

    changes.push({
      id: inv._id, number: inv.invoiceNumber, student: inv.studentName,
      due: inv.dueDate,
      fromPeriod: `${inv.periodStart} – ${inv.periodEnd}`, toPeriod: `${periodStart} – ${periodEnd}`,
      fromStatus: inv.status, toStatus: status,
      set: { periodStart, periodEnd, monthKey: periodStart.slice(0, 7), status, items },
    });
  }

  console.log(`open invoices        : ${invoices.length}`);
  console.log(`needing a change     : ${changes.length}`);
  console.log(`becoming Overdue     : ${changes.filter((c) => c.fromStatus !== "Overdue" && c.toStatus === "Overdue").length}\n`);
  for (const c of changes.slice(0, 10)) {
    console.log(`  ${c.number} ${c.student}  due ${c.due}`);
    console.log(`      period ${c.fromPeriod}  ->  ${c.toPeriod}`);
    console.log(`      status ${c.fromStatus} -> ${c.toStatus}`);
  }
  if (changes.length > 10) console.log(`  ... and ${changes.length - 10} more`);

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to save.");
  } else {
    for (const c of changes) await Invoice.updateOne({ _id: c.id }, { $set: c.set });
    console.log(`\nAPPLIED — updated ${changes.length} invoices. Due dates were not changed.`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Repoint failed:", err.message);
  process.exit(1);
});
