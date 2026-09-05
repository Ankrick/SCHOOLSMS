const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/settingsController");
const { requireRole } = require("../middleware/roleGuard");

// Admin reads settings so invoice previews can show the prefix and currency; changing
// them (default fee, next invoice number) belongs to the owner.
router.get("/", ctrl.getSettings);
router.put("/", requireRole("owner"), ctrl.updateSettings);

module.exports = router;
