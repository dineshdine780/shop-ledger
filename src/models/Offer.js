
const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    imageUrl: {
      type: String,
      default: "",
    },

    imagePublicId: {
      type: String,
      default: "",
    },

    // Shop-wide or product-specific offer
    offerType: {
      type: String,
      enum: ["shop", "product"],
      required: true,
    },

    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
    },

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },

    // Percentage or fixed amount
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true,
    },

    discountValue: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isFinite,
        message: "Discount value must be a valid number.",
      },
    },

    // Optional minimum eligible purchase amount
    minimumPurchase: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Optional cap for percentage discounts
    maximumDiscount: {
      type: Number,
      default: null,
      min: 0,
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

offerSchema.pre("validate", function () {
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

  if (this.offerType === "shop") {
    this.product = null;
  }

  if (this.offerType === "product" && !this.product) {
    this.invalidate(
      "product",
      "A product is required for a product offer."
    );
  }

  if (
    this.discountType === "fixed" &&
    this.maximumDiscount != null
  ) {
    this.invalidate(
      "maximumDiscount",
      "Maximum discount is only applicable to percentage offers."
    );
  }
});

module.exports = mongoose.model("Offer", offerSchema);
