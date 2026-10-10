const express = require("express");
const router = express.Router();

const {
  registerUser,
  loginUser,
} = require("../controllers/authController");

// Register a regular user
router.post("/register", registerUser);

// Login using phone number and password
router.post("/login", loginUser);

module.exports = router;