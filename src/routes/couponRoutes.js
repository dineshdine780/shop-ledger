const express = require("express");
const router = express.Router();

const {
  getAllCoupons,
  getAvailableCoupons,
  getOwnerCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} = require("../controllers/couponController");

const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

// Customer: view currently available coupons
router.get(
  "/available",
  protect,
  authorizeRoles("user"),
  getAvailableCoupons
);

router.get(
  "/owner",
  protect,
  authorizeRoles("owner"),
  getOwnerCoupons
);

// Admin-only routes
router.use(protect, authorizeRoles("admin"));

router.get("/", getAllCoupons);
router.post("/", createCoupon);
router.put("/:id", updateCoupon);
router.delete("/:id", deleteCoupon);
   
module.exports = router;


