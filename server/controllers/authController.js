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

exports.login = (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  const validUsername = safeEqual(username, process.env.ADMIN_USERNAME);
  const validPassword = safeEqual(password, process.env.ADMIN_PASSWORD);

  if (!validUsername || !validPassword) {
    return res.status(401).json({ message: "Invalid username or password" });
  }

  const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.json({ token });
};

exports.verify = (req, res) => {
  res.json({ username: req.user.username });
};
