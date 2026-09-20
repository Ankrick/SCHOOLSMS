const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/duesController");

// Dues are derived, so there is nothing to create, edit or delete — only to read and to pay.
router.get("/", ctrl.getDues);
router.patch("/pay", ctrl.payDue);

module.exports = router;
