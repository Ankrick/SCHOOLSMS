require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const errorHandler = require("./middleware/errorHandler");

const app = express();

connectDB();

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://schoolsms-git-main-ankricks-projects.vercel.app/"
  ]
}));
app.use(express.json());

app.use("/api/students", require("./routes/students"));
app.use("/api/teachers", require("./routes/teachers"));
app.use("/api/batches", require("./routes/batches"));
app.use("/api/invoices", require("./routes/invoices"));
app.use("/api/leads", require("./routes/leads"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/payment-history", require("./routes/paymentHistory"));
app.use("/api/data", require("./routes/data"));

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
