require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const errorHandler = require("./middleware/errorHandler");
const auth = require("./middleware/auth");
const { requireRole, MANAGE_FINANCE } = require("./middleware/roleGuard");

["JWT_SECRET", "ADMIN_USERNAME", "ADMIN_PASSWORD", "STUDENTS_ADMIN_USERNAME", "STUDENTS_ADMIN_PASSWORD"].forEach((key) => {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
});

// The owner account is optional on purpose: a missing value here disables that one login
// instead of taking the whole server down on a deploy where it wasn't set yet.
if (!process.env.OWNER_USERNAME || !process.env.OWNER_PASSWORD) {
  console.warn("OWNER_USERNAME / OWNER_PASSWORD not set — the owner login is disabled.");
}

const app = express();

connectDB();

app.use(cors());
// Payment slips ride along with "mark invoice paid" as base64 data URLs, which blow past
// body-parser's 100 KB default; the controller caps a single slip at 4 MB.
app.use(express.json({ limit: "10mb" }));

// Lightweight endpoint for uptime pingers — keeps a free-tier host from spinning down idle.
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

app.use("/api/auth", require("./routes/auth"));

// Any signed-in account may READ students and batches — the invoice screens need student
// and batch names to render. Writing them is owner/students_admin only, enforced per-verb
// inside these two routers.
app.use("/api/students", auth, require("./routes/students"));
app.use("/api/batches", auth, require("./routes/batches"));

// Billing records — what has been invoiced and collected: owner and admin.
app.use("/api/invoices", auth, requireRole(...MANAGE_FINANCE), require("./routes/invoices"));
app.use("/api/payment-history", auth, requireRole(...MANAGE_FINANCE), require("./routes/paymentHistory"));
// Settings: admin reads them (invoice previews use the prefix and currency); only the
// owner changes them — enforced per-verb inside the router.
app.use("/api/settings", auth, requireRole(...MANAGE_FINANCE), require("./routes/settings"));

// Payroll, the sales pipeline and destructive data management are the owner's alone.
app.use("/api/teachers", auth, requireRole("owner"), require("./routes/teachers"));
app.use("/api/leads", auth, requireRole("owner"), require("./routes/leads"));
app.use("/api/data", auth, requireRole("owner"), require("./routes/data"));

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
