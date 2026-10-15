
const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },

    discountType: {
      type: String,
      enum: ["fixed", "percentage"],
      required: true,
    },

    discountValue: {
      type: Number,
      required: true,
      min: 0.01,
    },

    minimumPurchase: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    maximumDiscount: {
      type: Number,
      default: null,
      min: 0,
    },

    // true = all shops; false = selected shops
    appliesToAllShops: {
      type: Boolean,
      default: false,
    },

    shops: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Shop",
      },
    ],

    // Total successful coupon redemptions allowed
    usageLimit: {
      type: Number,
      default: null,
      min: 1,
    },

    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Prevent the same user from redeeming this coupon twice
    oneUsePerUser: {
      type: Boolean,
      default: true,
    },

    // User IDs who have successfully redeemed this coupon
    usedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

couponSchema.pre("validate", function () {
  if (
    this.startDate &&
    this.endDate &&
    this.endDate < this.startDate
  ) {
    this.invalidate(
      "endDate",
      "End date must be on or after start date."
    );
  }

  if (
    this.discountType === "percentage" &&
    this.discountValue > 100
  ) {
    this.invalidate(
      "discountValue",
      "Percentage discount cannot exceed 100."
    );
  }

  if (
    this.discountType === "fixed" &&
    this.maximumDiscount != null
  ) {
    this.invalidate(
      "maximumDiscount",
      "Maximum discount applies only to percentage coupons."
    );
  }

  if (
    !this.appliesToAllShops &&
    (!this.shops || this.shops.length === 0)
  ) {
    this.invalidate(
      "shops",
      "Select at least one shop for this coupon."
    );
  }
});

module.exports = mongoose.model("Coupon", couponSchema);
