
const mongoose = require("mongoose");

const shopSchema = new mongoose.Schema(
  {
    shopName: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    area: {
      type: String,
      required: true,
      trim: true,
    },

    pincode: {
      type: String,
      required: true,
      match: /^\d{6}$/,
    },

    mobileNumber: {
      type: String,
      required: true,
      match: /^\d{10}$/,
    },
    owner: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  default: null,
},
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Shop", shopSchema);