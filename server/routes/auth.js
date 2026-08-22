const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/authController");
const auth = require("../middleware/auth");

router.post("/login", ctrl.login);
router.get("/verify", auth, ctrl.verify);

module.exports = router;
