
const mongoose = require("mongoose");

const otpVerificationSchema = new mongoose.Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      index: true,
    },

    purpose: {
      type: String,
      enum: ["register-user", "register-owner", "login"],
      required: true,
    },

    otpHash: {
      type: String,
      required: true,
      select: false,
    },

    pendingData: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
      select: false,
    },

    attempts: {
      type: Number,
      default: 0,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },

    verified: {
      type: Boolean,
      default: false,
    },

    resendCount: {
      type: Number,
      default: 0,
    },

    lastSentAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

otpVerificationSchema.index(
  { phoneNumber: 1, purpose: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "OtpVerification",
  otpVerificationSchema
);
