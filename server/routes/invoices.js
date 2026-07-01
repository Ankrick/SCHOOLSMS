const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/invoiceController");

router.get("/", ctrl.getInvoices);
router.post("/generate", ctrl.generateMonthly);
router.patch("/mark-overdue", ctrl.markOverdue);
router.post("/", ctrl.createInvoice);
router.put("/:id", ctrl.updateInvoice);
router.patch("/:id/pay", ctrl.markPaid);
router.delete("/:id", ctrl.deleteInvoice);

module.exports = router;
