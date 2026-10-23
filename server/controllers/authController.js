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

// FINANCE_ACCOUNTS / OPERATOR_ACCOUNTS hold any number of logins as
// "username:password,username:password". Split on the first colon only, so a password may
// contain one; a comma always starts the next account.
function parseAccounts(role, value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const sep = entry.indexOf(":");
      return sep > 0
        ? { role, username: entry.slice(0, sep), password: entry.slice(sep + 1) }
        : null;
    })
    .filter(Boolean);
}

function getAccounts() {
  return [
    // Owner sees everything. Optional: with OWNER_USERNAME/OWNER_PASSWORD unset, safeEqual
    // compares against "" and login already rejects empty credentials, so the account
    // simply never matches rather than the server refusing to start.
    { role: "owner", username: process.env.OWNER_USERNAME, password: process.env.OWNER_PASSWORD },
    ...parseAccounts("finance", process.env.FINANCE_ACCOUNTS),
    ...parseAccounts("operator", process.env.OPERATOR_ACCOUNTS),
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
