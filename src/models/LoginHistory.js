
const mongoose = require("mongoose");

const loginHistorySchema = new mongoose.Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    role: {
      type: String,
      enum: ["user", "owner", "admin"],
      default: null,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    status: {
      type: String,
      enum: ["success", "failed"],
      required: true,
    },

    reason: {
      type: String,
      enum: [
        "invalid-phone",
        "invalid-password",
        "inactive-account",
        "otp-required",
        "invalid-otp",
        "otp-expired",
        "otp-limit-exceeded",
        "success",
        "other",
      ],
      default: "other",
    },

    ipAddress: {
      type: String,
      default: null,
    },

    userAgent: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("LoginHistory", loginHistorySchema);
