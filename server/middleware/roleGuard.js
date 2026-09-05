// Role-based access control.
//
//   owner          — everything.
//   admin          — finance only: invoices, payment history, settings, leads, teachers,
//                    data import/reset. Reads students and batches (the invoice screens
//                    need the names) but cannot change them.
//   students_admin — students and batches, fees included. No billing records.
//
// Hiding tabs in the UI is not enough, since the API can be called directly, so the
// restriction is enforced here.

const MANAGE_RECORDS = ["owner", "students_admin"];
const MANAGE_FINANCE = ["owner", "admin"];

function requireRole(...allowed) {
  return (req, res, next) => {
    if (!allowed.includes(req.user?.role)) {
      return res.status(403).json({ message: "This account does not have access to that" });
    }
    next();
  };
}

module.exports = { requireRole, MANAGE_RECORDS, MANAGE_FINANCE };
