const crypto = require("crypto");
const jwt = require("jsonwebtoken");

// Constant-time string comparison that also tolerates differing lengths
// (guards against leaking username/password length via response timing).
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ""));
  const bufB = Buffer.from(String(b ?? ""));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function getAccounts() {
  return [
    { role: "admin", username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD },
    {
      role: "students_admin",
      username: process.env.STUDENTS_ADMIN_USERNAME,
      password: process.env.STUDENTS_ADMIN_PASSWORD,
    },
  ];
}

exports.login = (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  // Check every account rather than stopping at the first match, so a login
  // attempt's timing doesn't reveal which account (if any) it came close to.
  let matched = null;
  for (const account of getAccounts()) {
    const validUsername = safeEqual(username, account.username);
    const validPassword = safeEqual(password, account.password);
    if (validUsername && validPassword) matched = account;
  }

  if (!matched) {
    return res.status(401).json({ message: "Invalid username or password" });
  }

  const token = jwt.sign({ username: matched.username, role: matched.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
  res.json({ token, role: matched.role });
};

exports.verify = (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
};
