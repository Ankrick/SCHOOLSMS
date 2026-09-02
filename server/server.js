require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const errorHandler = require("./middleware/errorHandler");
const auth = require("./middleware/auth");
const { requireAdmin, hideMoneyFromNonAdmins } = require("./middleware/roleGuard");

["JWT_SECRET", "ADMIN_USERNAME", "ADMIN_PASSWORD", "STUDENTS_ADMIN_USERNAME", "STUDENTS_ADMIN_PASSWORD"].forEach((key) => {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
});

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

// Lightweight endpoint for uptime pingers — keeps a free-tier host from spinning down idle.
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

app.use("/api/auth", require("./routes/auth"));

// students_admin may reach these two, with every money field stripped from the response.
// Batch writes are still admin-only — see routes/batches.js.
app.use("/api/students", auth, hideMoneyFromNonAdmins, require("./routes/students"));
app.use("/api/batches", auth, hideMoneyFromNonAdmins, require("./routes/batches"));

// Everything financial, plus destructive data management, is admin-only.
app.use("/api/teachers", auth, requireAdmin, require("./routes/teachers"));
app.use("/api/invoices", auth, requireAdmin, require("./routes/invoices"));
app.use("/api/leads", auth, requireAdmin, require("./routes/leads"));
app.use("/api/settings", auth, requireAdmin, require("./routes/settings"));
app.use("/api/payment-history", auth, requireAdmin, require("./routes/paymentHistory"));
app.use("/api/data", auth, requireAdmin, require("./routes/data"));

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
