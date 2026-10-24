const express = require("express");
const router = express.Router();

const {
  getMyNotifications,
  markNotificationAsRead,
} = require("../controllers/notificationController");

const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

router.get(
  "/my",
  protect,
  authorizeRoles("user"),
  getMyNotifications
);

router.patch(
  "/:id/read",
  protect,
  authorizeRoles("user"),
  markNotificationAsRead
);

module.exports = router;