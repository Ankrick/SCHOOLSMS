const dns = require("dns");
const mongoose = require("mongoose");

// Some local resolvers (e.g. iPhone hotspots) return malformed SRV responses to
// Node, breaking mongodb+srv:// lookups. Use public DNS for Node's resolver.
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const DEFAULT_BATCHES = [
  { name: "CIE 0478 — Sat/Mon", syllabus: "CIE", days: "Sat & Mon", maxStudents: 15, fee: 180000 },
  { name: "Edexcel 4CP0 Batch 3 — Wed/Sun", syllabus: "Edexcel", days: "Wed & Sun", maxStudents: 15, fee: 180000 },
  { name: "CIE Oct/Nov 2026 — Wed/Thu", syllabus: "CIE", days: "Wed & Thu", maxStudents: 15, fee: 180000 },
];

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");
    await seedDefaults();
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
}

async function seedDefaults() {
  const Batch = require("../models/Batch");
  const Settings = require("../models/Settings");

  const batchCount = await Batch.countDocuments();
  if (batchCount === 0) {
    await Batch.insertMany(DEFAULT_BATCHES);
    console.log("Default batches seeded");
  }

  const settingsCount = await Settings.countDocuments();
  if (settingsCount === 0) {
    await Settings.create({
      defaultFee: 180000,
      currency: "MMK",
      autoInvoiceDay: 1,
      invoicePrefix: "TLC",
      nextInvoiceNum: 1001,
    });
    console.log("Default settings seeded");
  }
}

module.exports = connectDB;
