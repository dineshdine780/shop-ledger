const mongoose = require("mongoose");
const Notification = require("../models/Notification");

// Get notifications for the logged-in user
const getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      user: req.user._id,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: notifications.length,
      notifications,
    });
  } catch (error) {
    console.error("Get notifications error:", error);

    return res.status(500).json({
      success: false,
      message: "அறிவிப்புகளைப் பெற முடியவில்லை.",
    });
  }
};

// Mark one notification as read
const markNotificationAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "தவறான அறிவிப்பு ID.",
      });
    }

    const notification = await Notification.findOneAndUpdate(
      {
        _id: id,
        user: req.user._id,
      },
      {
        $set: { isRead: true },
      },
      {
        new: true,
      }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "அறிவிப்பு கிடைக்கவில்லை.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "அறிவிப்பு படித்ததாகக் குறிக்கப்பட்டது.",
      notification,
    });
  } catch (error) {
    console.error("Mark notification as read error:", error);

    return res.status(500).json({
      success: false,
      message: "அறிவிப்பைப் புதுப்பிக்க முடியவில்லை.",
    });
  }
};

module.exports = {
  getMyNotifications,
  markNotificationAsRead,
};