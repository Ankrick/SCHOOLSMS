const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/batchController");
const { requireAdmin } = require("../middleware/roleGuard");

// students_admin reads batches only to show which batch a student is in (fees stripped
// upstream); creating and changing batches stays with admin.
router.get("/", ctrl.getBatches);
router.post("/", requireAdmin, ctrl.createBatch);
router.put("/:id", requireAdmin, ctrl.updateBatch);
router.delete("/:id", requireAdmin, ctrl.deleteBatch);

module.exports = router;
