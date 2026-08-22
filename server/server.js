require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const errorHandler = require("./middleware/errorHandler");
const auth = require("./middleware/auth");

["JWT_SECRET", "ADMIN_USERNAME", "ADMIN_PASSWORD"].forEach((key) => {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
});

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

app.use("/api/auth", require("./routes/auth"));

app.use("/api/students", auth, require("./routes/students"));
app.use("/api/teachers", auth, require("./routes/teachers"));
app.use("/api/batches", auth, require("./routes/batches"));
app.use("/api/invoices", auth, require("./routes/invoices"));
app.use("/api/leads", auth, require("./routes/leads"));
app.use("/api/settings", auth, require("./routes/settings"));
app.use("/api/payment-history", auth, require("./routes/paymentHistory"));
app.use("/api/data", auth, require("./routes/data"));

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
