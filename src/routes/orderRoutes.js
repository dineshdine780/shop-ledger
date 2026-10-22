const express = require("express");
const router = express.Router();

const {
  createOrder,
  previewOrder,
  getMyOrders,
  getOwnerOrders,
  updateOrderStatus,
  updatePaymentStatus,
  updateOwnerOrderItems,
} = require("../controllers/orderController");

const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

// Customer routes
router.post("/preview", protect, authorizeRoles("user"), previewOrder);
router.post("/", protect, authorizeRoles("user"), createOrder);
router.get("/my", protect, authorizeRoles("user"), getMyOrders);

// Owner routes
router.get("/owner", protect, authorizeRoles("owner"), getOwnerOrders);

router.patch(
  "/:id/items",
  protect,
  authorizeRoles("owner"),
  updateOwnerOrderItems
);

router.patch(
  "/:id/status",
  protect,
  authorizeRoles("owner"),
  updateOrderStatus
);

router.patch(
  "/:id/payment",
  protect,
  authorizeRoles("owner"),
  updatePaymentStatus
);

module.exports = router;