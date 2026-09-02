// Role-based access control.
//
// students_admin manages students and batches — including the class fee on each — but not
// billing records: invoices, payment history, settings, leads, teachers and data
// import/reset are admin-only. Hiding those tabs in the UI is not enough, since the API
// can be called directly, so the restriction is enforced here.

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "This account does not have access to that data" });
  }
  next();
}

module.exports = { requireAdmin };
