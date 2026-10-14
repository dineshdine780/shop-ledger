const express = require("express");
const router = express.Router();

const {
  registerUser,
  registerCustomer,
  createOwner,
  registerOwner,
  loginUser,
  getUsers,
} = require("../controllers/authController");

const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

// Register admin
router.post("/register", registerUser);

// Register customer
router.post("/user/register", registerCustomer);

// Register owner
router.post("/owner/register", registerOwner);

// Login
router.post("/login", loginUser);

// Create owner — admin only
router.post(
  "/owner",
  protect,
  authorizeRoles("admin"),
  createOwner
);

// Get all members — admin only
router.get(
  "/users",
  protect,
  authorizeRoles("admin"),
  getUsers
);

module.exports = router;