
const express = require("express");
const router = express.Router();

const {
  createShop,
  getShops,
  getShopById,
  updateShop,
  deleteShop,
  getShopStats,
} = require("../controllers/shopController");

const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");


router.get(
  "/stats",
  protect,
  authorizeRoles("admin"),
  getShopStats
);

// Admin only - create shop
router.post("/", protect, authorizeRoles("admin"), createShop);

// Admin only - view all shops
router.get("/", protect, authorizeRoles("admin"), getShops);

// Admin only - view one shop
router.get("/:id", protect, authorizeRoles("admin"), getShopById);

// Admin only - update shop
router.put("/:id", protect, authorizeRoles("admin"), updateShop);

// Admin only - delete shop
router.delete("/:id", protect, authorizeRoles("admin"), deleteShop);

module.exports = router;