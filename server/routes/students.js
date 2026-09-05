const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/studentController");
const { requireRole, MANAGE_RECORDS } = require("../middleware/roleGuard");

// Reading is open to any signed-in account (admin's invoice screens need student names).
// Changing student records belongs to owner and students_admin.
const canManage = requireRole(...MANAGE_RECORDS);

router.get("/", ctrl.getStudents);
router.post("/", canManage, ctrl.createStudent);
router.put("/:id", canManage, ctrl.updateStudent);
router.delete("/:id", canManage, ctrl.deleteStudent);
router.patch("/:id/strikes/add", canManage, ctrl.addStrike);
router.patch("/:id/strikes/remove", canManage, ctrl.removeStrike);

module.exports = router;
