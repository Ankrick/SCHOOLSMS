const jwt = require("jsonwebtoken");
const { ROLES } = require("./roleGuard");

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  // Tokens last 7 days, so one issued to a retired role (the old admin / students_admin
  // logins) would otherwise keep reading students until it expired.
  if (!ROLES.includes(req.user.role)) {
    return res.status(401).json({ message: "This login is no longer in use — please sign in again" });
  }
  next();
}

module.exports = auth;
