// Role-based access control.
//
//   owner    — everything.
//   finance  — invoices, payment history, and students and batches (fees included): add,
//              edit and delete. Reads settings but cannot change them.
//   operator — read-only students and batches, cut down to name, batch, parent phone and
//              student Telegram, plus who joined each month and which batch. No fees and
//              no billing records — the student and batch controllers strip those fields
//              for this role.
//
// Hiding tabs in the UI is not enough, since the API can be called directly, so the
// restriction is enforced here.

const ROLES = ["owner", "finance", "operator"];
const MANAGE_RECORDS = ["owner", "finance"];
const MANAGE_FINANCE = ["owner", "finance"];

function requireRole(...allowed) {
  return (req, res, next) => {
    if (!allowed.includes(req.user?.role)) {
      return res.status(403).json({ message: "This account does not have access to that" });
    }
    next();
  };
}

module.exports = { requireRole, ROLES, MANAGE_RECORDS, MANAGE_FINANCE };
