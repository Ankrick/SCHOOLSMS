// Role-based access control.
//
// The students_admin account is limited to student records and must never see money
// amounts. Hiding fields in the UI is not enough — the API can be called directly — so
// the restriction is enforced here, both on the way out (responses) and on the way in
// (request bodies).

const FINANCIAL_FIELDS = ["fee", "customFee", "defaultFee"];

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "This account does not have access to that data" });
  }
  next();
}

// Deep-remove money fields. Mongoose documents and Dates both serialise through toJSON,
// so unwrap that first — a Date's toJSON returns a string, which is returned as-is.
function stripFinancial(value) {
  if (Array.isArray(value)) return value.map(stripFinancial);
  if (value === null || typeof value !== "object") return value;

  const plain = typeof value.toJSON === "function" ? value.toJSON() : value;
  if (Array.isArray(plain)) return plain.map(stripFinancial);
  if (plain === null || typeof plain !== "object") return plain;

  const out = {};
  for (const [key, val] of Object.entries(plain)) {
    if (FINANCIAL_FIELDS.includes(key)) continue;
    out[key] = stripFinancial(val);
  }
  return out;
}

// For routes a students_admin may reach (students, batches): strip money from the
// response, and ignore any money field they try to write.
function hideMoneyFromNonAdmins(req, res, next) {
  if (req.user?.role === "admin") return next();

  if (req.body && typeof req.body === "object") {
    for (const field of FINANCIAL_FIELDS) delete req.body[field];
  }

  const sendJson = res.json.bind(res);
  res.json = (body) => sendJson(stripFinancial(body));
  next();
}

module.exports = { requireAdmin, hideMoneyFromNonAdmins, stripFinancial, FINANCIAL_FIELDS };
