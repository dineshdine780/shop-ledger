
const Coupon = require("../models/Coupon");
const Shop = require("../models/Shop");

const normalizeCouponData = (body) => {
  const {
    code,
    discountType,
    discountValue,
    minimumPurchase,
    maximumDiscount,
    appliesToAllShops,
    shops,
    usageLimit,
    oneUsePerUser,
    startDate,
    endDate,
    isActive,
  } = body;

  return {
    code: String(code || "").trim().toUpperCase(),
    discountType,
    discountValue: Number(discountValue),
    minimumPurchase: Number(minimumPurchase ?? 0),
    maximumDiscount:
      maximumDiscount === "" || maximumDiscount == null
        ? null
        : Number(maximumDiscount),
    appliesToAllShops: appliesToAllShops === true,
    shops: appliesToAllShops === true ? [] : shops,
    usageLimit:
      usageLimit === "" || usageLimit == null
        ? null
        : Number(usageLimit),
    oneUsePerUser: oneUsePerUser !== false,
    startDate,
    endDate,
    isActive: isActive !== false,
  };
};

const validateShops = async (data) => {
  if (data.appliesToAllShops) return true;

  if (!Array.isArray(data.shops) || data.shops.length === 0) {
    return false;
  }

  const uniqueShopIds = [...new Set(data.shops.map(String))];

  if (uniqueShopIds.length !== data.shops.length) {
    return false;
  }

  const count = await Shop.countDocuments({
    _id: { $in: data.shops },
  });

  return count === uniqueShopIds.length;
};


const getAllCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find()
      .populate("shops", "shopName name")
      .sort({ createdAt: -1 });

    return res.json({ success: true, coupons });
  } catch (error) {
    console.error("Get coupons error:", error);
    return res.status(500).json({
      success: false,
      message: "கூப்பன்களைப் பெற முடியவில்லை.",
    });
  }
};


const getAvailableCoupons = async (req, res) => {
  try {
    const now = new Date();

    const coupons = await Coupon.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      $or: [
        { usageLimit: null },
        {
          $expr: {
            $lt: ["$usedCount", "$usageLimit"],
          },
        },
      ],
    })
      .populate("shops", "shopName name")
      .select(
        "code discountType discountValue minimumPurchase maximumDiscount appliesToAllShops shops usageLimit usedCount oneUsePerUser startDate endDate"
      )
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      coupons,
    });
  } catch (error) {
    console.error("Get available coupons error:", error);

    return res.status(500).json({
      success: false,
      message: "கிடைக்கும் கூப்பன்களைப் பெற முடியவில்லை.",
    });
  }
};



const getOwnerCoupons = async (req, res) => {
  try {
    const Shop = require("../models/Shop");

    // Find shops matching the logged-in owner's phone number
    const shops = await Shop.find({
      mobileNumber: req.user.phoneNumber,
    }).select("_id shopName mobileNumber");

    const shopIds = shops.map((shop) => shop._id);

    // No matching shop means no coupons
    if (shopIds.length === 0) {
      return res.status(200).json({
        success: true,
        shops,
        coupons: [],
      });
    }

    // Only coupons explicitly assigned to this owner's shops
    const coupons = await Coupon.find({
      appliesToAllShops: false,
      shops: { $in: shopIds },
    })
      .populate("shops", "shopName mobileNumber")
      .select(
        "code discountType discountValue minimumPurchase maximumDiscount appliesToAllShops shops usageLimit usedCount oneUsePerUser startDate endDate isActive createdAt"
      )
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      shops,
      coupons,
    });
  } catch (error) {
    console.error("Get owner coupons error:", error);

    return res.status(500).json({
      success: false,
      message: "உங்கள் கடையின் கூப்பன்களைப் பெற முடியவில்லை.",
    });
  }
};






const createCoupon = async (req, res) => {
  try {
    const data = normalizeCouponData(req.body);

    if (
      !data.code ||
      !["fixed", "percentage"].includes(data.discountType) ||
      !Number.isFinite(data.discountValue) ||
      data.discountValue <= 0 ||
      !Number.isFinite(data.minimumPurchase) ||
      data.minimumPurchase < 0 ||
      (data.discountType === "percentage" &&
        data.discountValue > 100) ||
      (data.discountType === "fixed" &&
        data.maximumDiscount != null) ||
      (data.maximumDiscount != null &&
        (!Number.isFinite(data.maximumDiscount) ||
          data.maximumDiscount < 0)) ||
      (data.usageLimit != null &&
        (!Number.isInteger(data.usageLimit) ||
          data.usageLimit < 1)) ||
      !data.startDate ||
      !data.endDate ||
      Number.isNaN(new Date(data.startDate).getTime()) ||
      Number.isNaN(new Date(data.endDate).getTime()) ||
      new Date(data.endDate) < new Date(data.startDate)
    ) {
      return res.status(400).json({
        success: false,
        message: "கூப்பன் விவரங்களைச் சரிபார்க்கவும்.",
      });
    }

    if (!(await validateShops(data))) {
      return res.status(400).json({
        success: false,
        message: "சரியான கடைகளைத் தேர்வு செய்யவும்.",
      });
    }

    const coupon = await Coupon.create(data);

    return res.status(201).json({
      success: true,
      message: "கூப்பன் உருவாக்கப்பட்டது.",
      coupon,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "இந்த coupon code ஏற்கனவே உள்ளது.",
      });
    }

    console.error("Create coupon error:", error);

    return res.status(500).json({
      success: false,
      message: "கூப்பனை உருவாக்க முடியவில்லை.",
    });
  }
};

const updateCoupon = async (req, res) => {
  try {
    const existing = await Coupon.findById(req.params.id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "கூப்பன் கிடைக்கவில்லை.",
      });
    }

    // Do not let an admin reset redemption counts via edit.
    const data = normalizeCouponData({
      ...existing.toObject(),
      ...req.body,
    });

    if (
      !data.code ||
      !["fixed", "percentage"].includes(data.discountType) ||
      !Number.isFinite(data.discountValue) ||
      data.discountValue <= 0 ||
      !Number.isFinite(data.minimumPurchase) ||
      data.minimumPurchase < 0 ||
      (data.discountType === "percentage" &&
        data.discountValue > 100) ||
      (data.discountType === "fixed" &&
        data.maximumDiscount != null) ||
      (data.maximumDiscount != null &&
        (!Number.isFinite(data.maximumDiscount) ||
          data.maximumDiscount < 0)) ||
      (data.usageLimit != null &&
        (!Number.isInteger(data.usageLimit) ||
          data.usageLimit < 1 ||
          data.usageLimit < existing.usedCount)) ||
      !data.startDate ||
      !data.endDate ||
      Number.isNaN(new Date(data.startDate).getTime()) ||
      Number.isNaN(new Date(data.endDate).getTime()) ||
      new Date(data.endDate) < new Date(data.startDate)
    ) {
      return res.status(400).json({
        success: false,
        message: "கூப்பன் விவரங்களைச் சரிபார்க்கவும்.",
      });
    }

    if (!(await validateShops(data))) {
      return res.status(400).json({
        success: false,
        message: "சரியான கடைகளைத் தேர்வு செய்யவும்.",
      });
    }

    existing.set({
      ...data,
      usedCount: existing.usedCount,
      usedBy: existing.usedBy,
    });

    await existing.save();

    return res.json({
      success: true,
      message: "கூப்பன் புதுப்பிக்கப்பட்டது.",
      coupon: existing,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "இந்த coupon code ஏற்கனவே உள்ளது.",
      });
    }

    console.error("Update coupon error:", error);

    return res.status(500).json({
      success: false,
      message: "கூப்பனைப் புதுப்பிக்க முடியவில்லை.",
    });
  }
};


const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "கூப்பன் கிடைக்கவில்லை.",
      });
    }

    if (coupon.usedCount > 0) {
      return res.status(400).json({
        success: false,
        message:
          "ஏற்கனவே பயன்படுத்தப்பட்ட கூப்பனை நீக்க முடியாது. அதை inactive ஆக்கவும்.",
      });
    }

    await coupon.deleteOne();

    return res.json({
      success: true,
      message: "கூப்பன் நீக்கப்பட்டது.",
    });
  } catch (error) {
    console.error("Delete coupon error:", error);

    return res.status(500).json({
      success: false,
      message: "கூப்பனை நீக்க முடியவில்லை.",
    });
  }
};

module.exports = {
  getAllCoupons,
  getAvailableCoupons,
  getOwnerCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
};
