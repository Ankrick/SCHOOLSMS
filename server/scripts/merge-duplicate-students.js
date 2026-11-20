// One-off: merge students who were entered once per batch into one student with several
// enrollments (see utils/enrollments.js).
//
// Records are merged only when they share a name AND something concrete — guardian contact,
// Telegram, parent phone or Burmese name. Same name and nothing else in common is reported and
// left alone; name it with --include to merge it anyway.
//
// What a merge does, for each group:
//   · keeps the earliest-enrolled record as the student; each record becomes one enrollment,
//     keeping its batch, billing date, fee, plan and deleted invoices, and its id (so every
//     payment on it still finds its batch). A record that was inactive becomes a batch the
//     student has left.
//   · fills the kept student's blank details from the others. Where they disagree, the kept
//     record's value stays and the others are written into the notes, so nothing is lost.
//   · moves the other records' payments onto the kept student, tagged with their enrollment.
//     Amounts, dates, receipt numbers and slips are untouched.
//   · deletes the other records.
//
//   node scripts/merge-duplicate-students.js                         # dry run: prints the plan
//   node scripts/merge-duplicate-students.js --include "Liam"        # also merge a same-name group
//   node scripts/merge-duplicate-students.js --apply                 # backs up, then merges
//   node scripts/merge-duplicate-students.js --restore <backup.json> # puts a merge back

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
// Some local resolvers (e.g. iPhone hotspots) return malformed SRV responses; same as config/db.js.
require("dns").setServers(["8.8.8.8", "1.1.1.1"]);
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { enrollmentsOf, enrollmentIdOfPayment, LEGACY_FIELDS } = require("../utils/enrollments");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const RESTORE = args.includes("--restore") ? args[args.indexOf("--restore") + 1] : null;
const INCLUDE = args.flatMap((a, i) => (a === "--include" ? [args[i + 1]] : [])).map((n) => norm(n));

function norm(x) {
  return String(x || "").toLowerCase().replace(/\s+/g, " ").trim();
}
const contactKey = (x) => norm(x).replace(/\(fb\)|\bfb\b/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
const telegramKey = (x) => norm(x).replace(/^@/, "").replace(/[^\p{L}\p{N}]+/gu, "");
const phoneKey = (x) => String(x || "").replace(/\D/g, "").slice(-8);

// The things two records can have in common, besides the name.
function signals(s) {
  return [
    s.invoiceContact && `contact:${contactKey(s.invoiceContact)}`,
    s.parentName && `contact:${contactKey(s.parentName)}`,
    s.telegram && telegramKey(s.telegram).length > 2 && `tg:${telegramKey(s.telegram)}`,
    phoneKey(s.parentPhone).length >= 7 && `phone:${phoneKey(s.parentPhone)}`,
    s.nameBurmese && `mm:${contactKey(s.nameBurmese)}`,
  ].filter(Boolean);
}

// Within a same-name group, records linked by any shared signal (directly or through another).
function clusters(group, forced) {
  if (forced) return [group];
  const parent = group.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = new Set(signals(group[i]));
      if (signals(group[j]).some((x) => a.has(x))) parent[find(i)] = find(j);
    }
  }
  const out = new Map();
  group.forEach((s, i) => {
    const root = find(i);
    if (!out.has(root)) out.set(root, []);
    out.get(root).push(s);
  });
  return [...out.values()];
}

const DETAIL_FIELDS = ["nameBurmese", "telegram", "invoiceContact", "parentName", "parentPhone", "parentFacebook", "email", "phone"];
const LABELS = { nameBurmese: "Burmese name", telegram: "Telegram", invoiceContact: "guardian contact", parentName: "parent name", parentPhone: "parent phone", parentFacebook: "parent Facebook", email: "email", phone: "phone" };

function planMerge(records, batchName) {
  const ordered = records.slice().sort((a, b) => (a.enrolledDate || "").localeCompare(b.enrolledDate || "") || String(a._id).localeCompare(String(b._id)));
  const keeper = ordered[0];
  const others = ordered.slice(1);

  const details = {};
  const extra = [];
  for (const f of DETAIL_FIELDS) {
    const values = ordered.map((r) => (r[f] || "").trim()).filter(Boolean);
    details[f] = (keeper[f] || "").trim() || values[0] || "";
    // Compared the way records are matched, so "@name" and "name", or "Hnin Htwe (fb)" and
    // "Hnin Htwe", are not reported as different.
    const key = f === "telegram" ? telegramKey : f === "parentPhone" || f === "phone" ? phoneKey : contactKey;
    const seen = new Set([key(details[f])]);
    for (const v of values) {
      if (seen.has(key(v))) continue;
      seen.add(key(v));
      extra.push(`${LABELS[f]} "${v}"`);
    }
  }

  const enrollments = [];
  for (const r of ordered) {
    for (const e of enrollmentsOf(r)) {
      enrollments.push({ ...e, status: r.status === "Active" ? e.status : "Inactive" });
    }
  }
  const batches = enrollments.map((e) => e.batchId);
  const clash = batches.find((b, i) => batches.indexOf(b) !== i);

  const notes = [...new Set(ordered.map((r) => (r.notes || "").trim()).filter(Boolean))];
  if (extra.length) notes.push(`Merged from ${ordered.length} records: also had ${extra.join(", ")}.`);

  return {
    keeper,
    others,
    clash: clash !== undefined ? batchName(clash) : null,
    update: {
      ...details,
      notes: notes.join("\n"),
      status: ordered.some((r) => r.status === "Active") ? "Active" : keeper.status,
      strikes: Math.max(...ordered.map((r) => r.strikes || 0)),
      enrolledDate: ordered.map((r) => r.enrolledDate).filter(Boolean).sort()[0] || keeper.enrolledDate,
      enrollments: enrollments.map(({ id, ...e }) => ({ _id: new mongoose.Types.ObjectId(id), ...e })),
    },
  };
}

async function restore(file) {
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  const db = mongoose.connection.db;
  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    for (const s of backup.students) {
      const doc = mongoose.mongo.BSON.EJSON.deserialize(s);
      await db.collection("students").replaceOne({ _id: doc._id }, doc, { upsert: true, session });
    }
    for (const p of backup.payments) {
      const set = { studentId: p.studentId, studentName: p.studentName, nameBurmese: p.nameBurmese };
      const change = p.enrollmentId ? { $set: { ...set, enrollmentId: p.enrollmentId } } : { $set: set, $unset: { enrollmentId: "" } };
      await db.collection("paymenthistories").updateOne({ _id: new mongoose.Types.ObjectId(p._id) }, change, { session });
    }
    for (const l of backup.leads) {
      await db.collection("leads").updateOne({ _id: new mongoose.Types.ObjectId(l._id) }, { $set: { convertedStudentId: l.convertedStudentId } }, { session });
    }
  });
  await session.endSession();
  console.log(`Restored ${backup.students.length} student records and ${backup.payments.length} payments from ${file}.`);
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  if (RESTORE) return restore(RESTORE);

  const db = mongoose.connection.db;
  const [students, batches, payments, leads] = await Promise.all([
    db.collection("students").find().toArray(),
    db.collection("batches").find().toArray(),
    db.collection("paymenthistories").find({}, { projection: { "slip.image": 0 } }).toArray(),
    db.collection("leads").find({ convertedStudentId: { $ne: null } }).toArray(),
  ]);
  const batchName = (id) => (batches.find((b) => String(b._id) === id) || { name: id ? "(deleted batch)" : "No batch" }).name;
  for (const s of students) s.id = String(s._id);

  const byName = new Map();
  for (const s of students) {
    const k = norm(s.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(s);
  }

  const merges = [];
  const leftAlone = [];
  for (const [key, group] of byName) {
    if (group.length < 2) continue;
    for (const c of clusters(group, INCLUDE.includes(key))) {
      if (c.length > 1) merges.push(planMerge(c, batchName));
      else leftAlone.push(c[0]);
    }
  }

  console.log(`${students.length} student records; ${merges.length} people to merge from ${merges.reduce((n, m) => n + 1 + m.others.length, 0)} records.\n`);
  for (const m of merges) {
    const own = (r) => payments.filter((p) => p.studentId === r.id).length;
    console.log(`■ ${m.keeper.name}${m.clash ? `   ✖ NOT MERGED: two records in ${m.clash}` : ""}`);
    console.log(`  keeps   ${m.keeper.id}  ${batchName(enrollmentsOf(m.keeper)[0].batchId)} (${m.keeper.status}, joined ${m.keeper.enrolledDate}, ${own(m.keeper)} payments)`);
    for (const r of m.others) console.log(`  merges  ${r.id}  ${batchName(enrollmentsOf(r)[0].batchId)} (${r.status}, joined ${r.enrolledDate}, ${own(r)} payments)`);
    console.log(`  → batches: ${m.update.enrollments.map((e) => `${batchName(e.batchId)}${e.status === "Inactive" ? " (left)" : ""}`).join(", ")}`);
    const lastNote = m.update.notes.split("\n").pop();
    if (lastNote.startsWith("Merged from")) console.log(`  → notes: ${lastNote}`);
    console.log("");
  }
  if (leftAlone.length) {
    console.log("Same name but nothing else in common — left as separate students:");
    const shown = new Set();
    for (const s of leftAlone) {
      const k = norm(s.name);
      if (shown.has(k)) continue;
      shown.add(k);
      const same = leftAlone.filter((x) => norm(x.name) === k);
      if (same.length < 2) continue;
      console.log(`  ${s.name}: ${same.map((x) => `${batchName(enrollmentsOf(x)[0].batchId)} [Burmese "${x.nameBurmese || ""}", Telegram "${x.telegram || ""}", contact "${x.invoiceContact || ""}"]`).join("  |  ")}`);
      console.log(`    (to merge anyway: --include "${s.name}")`);
    }
    console.log("");
  }

  const ready = merges.filter((m) => !m.clash);
  if (!APPLY) {
    console.log("Dry run — nothing written. Re-run with --apply to merge.");
    return;
  }
  if (ready.length === 0) {
    console.log("Nothing to merge.");
    return;
  }

  // Everything a restore needs, written before anything changes.
  const affectedIds = new Set(ready.flatMap((m) => [m.keeper.id, ...m.others.map((r) => r.id)]));
  const backup = {
    takenAt: new Date().toISOString(),
    students: students.filter((s) => affectedIds.has(s.id)).map(({ id, ...s }) => mongoose.mongo.BSON.EJSON.serialize(s)),
    payments: payments.filter((p) => affectedIds.has(p.studentId)).map((p) => ({
      _id: String(p._id), studentId: p.studentId, enrollmentId: p.enrollmentId, studentName: p.studentName, nameBurmese: p.nameBurmese,
    })),
    leads: leads.filter((l) => affectedIds.has(String(l.convertedStudentId))).map((l) => ({ _id: String(l._id), convertedStudentId: l.convertedStudentId })),
  };
  const dir = path.resolve(__dirname, "../backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `merge-students-${backup.takenAt.replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(backup, null, 2));
  console.log(`Backup written: ${file}`);

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    for (const m of ready) {
      const unset = Object.fromEntries(LEGACY_FIELDS.map((f) => [f, ""]));
      await db.collection("students").updateOne({ _id: m.keeper._id }, { $set: m.update, $unset: unset }, { session });
      for (const r of [m.keeper, ...m.others]) {
        for (const p of payments.filter((x) => x.studentId === r.id)) {
          await db.collection("paymenthistories").updateOne(
            { _id: p._id },
            { $set: { studentId: m.keeper.id, enrollmentId: enrollmentIdOfPayment(p, r), studentName: m.keeper.name, nameBurmese: m.update.nameBurmese } },
            { session }
          );
        }
        if (r !== m.keeper) {
          await db.collection("leads").updateMany({ convertedStudentId: r.id }, { $set: { convertedStudentId: m.keeper.id } }, { session });
          await db.collection("students").deleteOne({ _id: r._id }, { session });
        }
      }
    }
  });
  await session.endSession();
  console.log(`Merged ${ready.length} students. To undo: node scripts/merge-duplicate-students.js --restore "${file}"`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
