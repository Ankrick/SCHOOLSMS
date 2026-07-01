const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/teacherController");

router.get("/", ctrl.getTeachers);
router.post("/", ctrl.createTeacher);
router.put("/:id", ctrl.updateTeacher);
router.delete("/:id", ctrl.deleteTeacher);

module.exports = router;
