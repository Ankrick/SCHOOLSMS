const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/batchController");

router.get("/", ctrl.getBatches);
router.post("/", ctrl.createBatch);
router.put("/:id", ctrl.updateBatch);
router.delete("/:id", ctrl.deleteBatch);

module.exports = router;
