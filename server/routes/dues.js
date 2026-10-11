const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/duesController");
const { requireRole } = require("../middleware/roleGuard");

// Dues are derived, so there is nothing to create or edit — only to read and to pay. Deleting
// an invoice records an exception to the student's schedule, and is the owner's alone.
router.get("/", ctrl.getDues);
router.patch("/pay", ctrl.payDue);
router.post("/remove", requireRole("owner"), ctrl.removeDues);
router.post("/restore", requireRole("owner"), ctrl.restoreDues);

module.exports = router;
