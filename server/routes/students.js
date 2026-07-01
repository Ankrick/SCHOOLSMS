const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/studentController");

router.get("/", ctrl.getStudents);
router.post("/", ctrl.createStudent);
router.put("/:id", ctrl.updateStudent);
router.delete("/:id", ctrl.deleteStudent);
router.patch("/:id/strikes/add", ctrl.addStrike);
router.patch("/:id/strikes/remove", ctrl.removeStrike);

module.exports = router;
