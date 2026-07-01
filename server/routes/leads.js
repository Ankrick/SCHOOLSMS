const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/leadController");

router.get("/", ctrl.getLeads);
router.post("/", ctrl.createLead);
router.put("/:id", ctrl.updateLead);
router.delete("/:id", ctrl.deleteLead);
router.post("/:id/convert", ctrl.convertToStudent);

module.exports = router;
