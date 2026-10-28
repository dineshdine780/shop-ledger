
const express = require("express");
const router = express.Router();

const {
  registerUser,
  registerCustomer,
  createOwner,
  registerOwner,
  loginUser,
  getUsers,
  getLoginActivity,
} = require("../controllers/authController");

const { createCaptcha } = require("../utils/captcha");

const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

// Generate CAPTCHA image
router.get("/captcha", (req, res) => {
  try {
    const captcha = createCaptcha();

    return res.status(200).json({
      success: true,
      captchaId: captcha.captchaId,
      image: captcha.image,
    });
  } catch (error) {
    console.error("CAPTCHA generation error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not generate CAPTCHA",
    });
  }
});

// Initial admin registration — requires ADMIN_SETUP_KEY
router.post("/register", registerUser);

// Customer registration — CAPTCHA + name + phone + password
router.post("/user/register", registerCustomer);

// Owner registration — CAPTCHA + matching unassigned shop
router.post("/owner/register", registerOwner);

// Login — CAPTCHA + phone + password
router.post("/login", loginUser);

// Create owner — admin only
router.post(
  "/owner",
  protect,
  authorizeRoles("admin"),
  createOwner
);

// Get all customers — admin only
router.get(
  "/users",
  protect,
  authorizeRoles("admin"),
  getUsers
);

// Get login activity — admin only
router.get(
  "/login-activity",
  protect,
  authorizeRoles("admin"),
  getLoginActivity
);

module.exports = router;
