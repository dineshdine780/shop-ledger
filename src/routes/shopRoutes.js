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

// Admin dashboard statistics
router.get(
  "/stats",
  protect,
  authorizeRoles("admin"),
  getShopStats
);

// Owner - get only shops assigned to the logged-in owner
// Owner - get shops matching the logged-in owner's phone number
router.get(
  "/owner",
  protect,
  authorizeRoles("owner"),
  async (req, res) => {
    try {
      const Shop = require("../models/Shop");

      const shops = await Shop.find({
        mobileNumber: req.user.phoneNumber,
      }).sort({ createdAt: -1 });

      return res.status(200).json({
        success: true,
        count: shops.length,
        shops,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch owner shops",
      });
    }
  }
);


router.post("/", protect, authorizeRoles("admin"), createShop);

// USER - View all shops
router.get(
  "/public",
  protect,
  authorizeRoles("user"),
  getShops
);

router.get("/", protect, authorizeRoles("admin"), getShops);


router.get("/:id", protect, authorizeRoles("admin"), getShopById);


router.put("/:id", protect, authorizeRoles("admin"), updateShop);


router.delete("/:id", protect, authorizeRoles("admin"), deleteShop);

module.exports = router;