// One-off backfill: populate Student.invoiceContact from the old parentName +
// parentFacebook pair, so no existing contact detail is lost when the UI merges them.
//
// Additive and idempotent: it only fills rows where invoiceContact is still empty, and it
// never modifies or clears parentName / parentFacebook.
//
//   node scripts/backfill-invoice-contact.js           # dry run, prints what it would do
//   node scripts/backfill-invoice-contact.js --apply   # writes the changes

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const Student = require("../models/Student");

const APPLY = process.argv.includes("--apply");

// Join the two old fields, skipping blanks and dropping an exact duplicate.
function combine(parentName, parentFacebook) {
  const a = (parentName || "").trim();
  const b = (parentFacebook || "").trim();
  if (!a) return b;
  if (!b) return a;
  if (a.toLowerCase() === b.toLowerCase()) return a;
  return `${a} · ${b}`;
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const students = await Student.find().lean();

  const planned = [];
  for (const s of students) {
    if ((s.invoiceContact || "").trim()) continue; // already set — leave it alone
    const merged = combine(s.parentName, s.parentFacebook);
    if (!merged) continue; // nothing to carry over
    planned.push({ id: s._id, name: s.name, from: [s.parentName, s.parentFacebook], to: merged });
  }

  console.log(`students total          : ${students.length}`);
  console.log(`already have a contact  : ${students.filter((s) => (s.invoiceContact || "").trim()).length}`);
  console.log(`nothing to carry over   : ${students.length - planned.length - students.filter((s) => (s.invoiceContact || "").trim()).length}`);
  console.log(`to backfill             : ${planned.length}\n`);

  const merges = planned.filter((p) => p.from[0] && p.from[1] && p.from[0].trim().toLowerCase() !== p.from[1].trim().toLowerCase());
  console.log(`of those, ${merges.length} combine two different values:`);
  for (const m of merges.slice(0, 15)) {
    console.log(`  ${m.name}: "${m.from[0]}" + "${m.from[1]}"  ->  "${m.to}"`);
  }
  if (merges.length > 15) console.log(`  ... and ${merges.length - 15} more`);

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to save.");
  } else {
    for (const p of planned) {
      await Student.updateOne({ _id: p.id }, { $set: { invoiceContact: p.to } });
    }
    console.log(`\nAPPLIED — set invoiceContact on ${planned.length} students.`);
    console.log("parentName and parentFacebook were left untouched.");
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Backfill failed:", err.message);
  process.exit(1);
});
