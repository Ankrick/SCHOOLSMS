const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/batchController");
const { requireRole, MANAGE_RECORDS } = require("../middleware/roleGuard");

// Reading is open to any signed-in account (admin's invoice screens need batch names).
// Changing batches, fee included, belongs to owner and students_admin.
const canManage = requireRole(...MANAGE_RECORDS);

router.get("/", ctrl.getBatches);
router.post("/", canManage, ctrl.createBatch);
router.put("/:id", canManage, ctrl.updateBatch);
router.delete("/:id", canManage, ctrl.deleteBatch);

module.exports = router;
