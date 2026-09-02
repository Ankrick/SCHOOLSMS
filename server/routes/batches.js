const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/batchController");

// Both accounts manage batches, fee included.
router.get("/", ctrl.getBatches);
router.post("/", ctrl.createBatch);
router.put("/:id", ctrl.updateBatch);
router.delete("/:id", ctrl.deleteBatch);

module.exports = router;
