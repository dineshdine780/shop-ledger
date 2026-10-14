const mongoose = require("mongoose");
const Offer = require("../models/Offer");
const Shop = require("../models/Shop");
const Product = require("../models/Product");

const uploadImage = require("../utils/cloudinaryUpload");
const cloudinary = require("../config/cloudinary");
// Helper: Find shops owned by the logged-in owner
const getOwnerShops = async (user) => {
  return Shop.find({ mobileNumber: user.phoneNumber }).select("_id");
};

// Helper: Check whether a shop belongs to the owner
const isOwnerShop = (shopId, ownerShopIds) => {
  return ownerShopIds.some(
    (id) => id.toString() === shopId.toString()
  );
};


// GET - Get active and upcoming offers for users
const getAllOffers = async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const offers = await Offer.find({
      endDate: { $gte: today },
    })
      .populate("shop", "shopName area")
      .populate("product", "productName price")
      .sort({ startDate: 1, endDate: 1, createdAt: -1 });

    // Today’s active offers first, upcoming offers next
    const sortedOffers = offers.sort((a, b) => {
      const aStartsToday = new Date(a.startDate) < tomorrow;
      const bStartsToday = new Date(b.startDate) < tomorrow;

      if (aStartsToday !== bStartsToday) {
        return aStartsToday ? -1 : 1;
      }

      return (
        new Date(a.startDate) - new Date(b.startDate) ||
        new Date(a.endDate) - new Date(b.endDate)
      );
    });

    return res.status(200).json({
      success: true,
      count: sortedOffers.length,
      offers: sortedOffers,
    });
  } catch (error) {
    console.error("Get all offers error:", error);

    return res.status(500).json({
      success: false,
      message: "ஆஃபர்களைப் பெற முடியவில்லை.",
    });
  }
};


// GET - Get owner's offers
const getOwnerOffers = async (req, res) => {
  try {
    const ownerShops = await getOwnerShops(req.user);
    const shopIds = ownerShops.map((shop) => shop._id);

    const offers = await Offer.find({ shop: { $in: shopIds } })
      .populate("shop", "shopName")
      .populate("product", "productName price")
      .sort({ createdAt: -1 });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const offersWithStatus = offers.map((offer) => {
      const start = new Date(offer.startDate);
      start.setHours(0, 0, 0, 0);

      const end = new Date(offer.endDate);
      end.setHours(0, 0, 0, 0);

      let status = "Upcoming";

      if (today < start) {
        status = "Upcoming";
      } else if (today > end) {
        status = "Expired";
      } else {
        status = "Active";
      }

      return {
        ...offer.toObject(),
        status,
      };
    });

    return res.status(200).json({
      success: true,
      count: offersWithStatus.length,
      offers: offersWithStatus,
    });
  } catch (error) {
    console.error("Get owner offers error:", error);

    return res.status(500).json({
      success: false,
      message: "சலுகைகளைப் பெற முடியவில்லை.",
    });
  }
};

// POST - Create a new offer

const createOffer = async (req, res) => {
  let uploadedImage = null;

  try {
    const {
      title,
      description,
      offerType,
      shopId,
      productId,
      discountType,
      discountValue,
      startDate,
      endDate,
    } = req.body;

    if (
      !title?.trim() ||
      !["shop", "product"].includes(offerType) ||
      !shopId ||
      !["percentage", "fixed"].includes(discountType) ||
      discountValue === undefined ||
      !startDate ||
      !endDate
    ) {
      return res.status(400).json({
        success: false,
        message: "அனைத்து தேவையான சலுகை விவரங்களையும் உள்ளிடவும்.",
      });
    }

    const value = Number(discountValue);
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (
      !Number.isFinite(value) ||
      value < 0 ||
      (discountType === "percentage" && value > 100) ||
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end < start
    ) {
      return res.status(400).json({
        success: false,
        message: "தள்ளுபடி மதிப்பு அல்லது தேதிகளைச் சரிபார்க்கவும்.",
      });
    }

    if (
      !mongoose.isValidObjectId(shopId) ||
      (offerType === "product" &&
        (!productId || !mongoose.isValidObjectId(productId)))
    ) {
      return res.status(400).json({
        success: false,
        message: "சரியான கடை மற்றும் பொருளைத் தேர்வு செய்யவும்.",
      });
    }

    const ownerShops = await getOwnerShops(req.user);
    const ownerShopIds = ownerShops.map((shop) => shop._id);

    if (!isOwnerShop(shopId, ownerShopIds)) {
      return res.status(403).json({
        success: false,
        message: "இந்தக் கடையில் சலுகை உருவாக்க அனுமதி இல்லை.",
      });
    }

    let verifiedProductId = null;

    if (offerType === "product") {
      const product = await Product.findOne({
        _id: productId,
        shop: shopId,
      });

      if (!product) {
        return res.status(400).json({
          success: false,
          message: "தேர்ந்தெடுத்த பொருள் இந்தக் கடையில் இல்லை.",
        });
      }

      verifiedProductId = product._id;
    }

    // Upload an image only when one is provided
    let imageData = {
      imageUrl: "",
      imagePublicId: "",
    };

    if (req.file) {
      uploadedImage = await uploadImage(req.file.buffer);

      imageData = {
        imageUrl: uploadedImage.url,
        imagePublicId: uploadedImage.publicId,
      };
    }

    const offer = await Offer.create({
      title: title.trim(),
      description: description?.trim() || "",
      offerType,
      shop: shopId,
      product: verifiedProductId,
      discountType,
      discountValue: value,
      startDate: start,
      endDate: end,
      ...imageData,
    });

    const populatedOffer = await Offer.findById(offer._id)
      .populate("shop", "shopName")
      .populate("product", "productName price");

    return res.status(201).json({
      success: true,
      message: "சலுகை வெற்றிகரமாக உருவாக்கப்பட்டது.",
      offer: populatedOffer,
    });
  } catch (error) {
    console.error("Create offer error:", error);

    // Clean up the uploaded image if saving the offer failed
    if (uploadedImage?.publicId) {
      try {
        await cloudinary.uploader.destroy(uploadedImage.publicId);
      } catch (cleanupError) {
        console.error("Cloudinary cleanup error:", cleanupError);
      }
    }

    return res.status(500).json({
      success: false,
      message: "சலுகையை உருவாக்க முடியவில்லை.",
    });
  }
};

// PUT - Update an existing offer


const updateOffer = async (req, res) => {
  let uploadedImage = null;
  let offerSaved = false;

  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "தவறான சலுகை ID.",
      });
    }

    const ownerShops = await getOwnerShops(req.user);
    const ownerShopIds = ownerShops.map((shop) => shop._id);

    const offer = await Offer.findById(id);

    if (!offer || !isOwnerShop(offer.shop, ownerShopIds)) {
      return res.status(404).json({
        success: false,
        message: "சலுகை கிடைக்கவில்லை.",
      });
    }

    // Preserve the old image ID before changing anything
    const oldImagePublicId = offer.imagePublicId;

    const {
      title,
      description,
      offerType,
      shopId,
      productId,
      discountType,
      discountValue,
      startDate,
      endDate,
    } = req.body;

    const nextTitle = title ?? offer.title;
    const nextDescription = description ?? offer.description;
    const nextType = offerType ?? offer.offerType;
    const nextShopId = shopId ?? offer.shop.toString();
    const nextDiscountType = discountType ?? offer.discountType;
    const nextValue = Number(discountValue ?? offer.discountValue);
    const nextStart = new Date(startDate ?? offer.startDate);
    const nextEnd = new Date(endDate ?? offer.endDate);

    if (
      typeof nextTitle !== "string" ||
      !nextTitle.trim() ||
      !["shop", "product"].includes(nextType) ||
      !["percentage", "fixed"].includes(nextDiscountType) ||
      !Number.isFinite(nextValue) ||
      nextValue < 0 ||
      (nextDiscountType === "percentage" && nextValue > 100) ||
      Number.isNaN(nextStart.getTime()) ||
      Number.isNaN(nextEnd.getTime()) ||
      nextEnd < nextStart
    ) {
      return res.status(400).json({
        success: false,
        message: "சலுகை விவரங்களைச் சரிபார்க்கவும்.",
      });
    }

    if (!mongoose.isValidObjectId(nextShopId)) {
      return res.status(400).json({
        success: false,
        message: "சரியான கடையைத் தேர்வு செய்யவும்.",
      });
    }

    if (!isOwnerShop(nextShopId, ownerShopIds)) {
      return res.status(403).json({
        success: false,
        message: "இந்தக் கடையை மாற்ற அனுமதி இல்லை.",
      });
    }

    let nextProductId = null;

    if (nextType === "product") {
      const chosenProductId =
        productId ?? offer.product?.toString();

      if (
        !chosenProductId ||
        !mongoose.isValidObjectId(chosenProductId)
      ) {
        return res.status(400).json({
          success: false,
          message: "சரியான பொருளைத் தேர்வு செய்யவும்.",
        });
      }

      const product = await Product.findOne({
        _id: chosenProductId,
        shop: nextShopId,
      });

      if (!product) {
        return res.status(400).json({
          success: false,
          message: "தேர்ந்தெடுத்த பொருள் இந்தக் கடையில் இல்லை.",
        });
      }

      nextProductId = product._id;
    }

    // Upload the replacement image if provided
    if (req.file) {
      uploadedImage = await uploadImage(req.file.buffer);
    }

    offer.title = nextTitle.trim();
    offer.description =
      typeof nextDescription === "string"
        ? nextDescription.trim()
        : "";
    offer.offerType = nextType;
    offer.shop = nextShopId;
    offer.product = nextProductId;
    offer.discountType = nextDiscountType;
    offer.discountValue = nextValue;
    offer.startDate = nextStart;
    offer.endDate = nextEnd;

    // Keep the existing image if no new image was uploaded
    if (uploadedImage) {
      offer.imageUrl = uploadedImage.url;
      offer.imagePublicId = uploadedImage.publicId;
    }

    await offer.save();
    offerSaved = true;

    // Remove the old image only after the database save succeeds
    if (
      uploadedImage &&
      oldImagePublicId &&
      oldImagePublicId !== uploadedImage.publicId
    ) {
      try {
        await cloudinary.uploader.destroy(oldImagePublicId);
      } catch (cleanupError) {
        console.error(
          "Old offer image cleanup error:",
          cleanupError
        );
      }
    }

    const updatedOffer = await Offer.findById(offer._id)
      .populate("shop", "shopName")
      .populate("product", "productName price");

    return res.status(200).json({
      success: true,
      message: "சலுகை வெற்றிகரமாகத் திருத்தப்பட்டது.",
      offer: updatedOffer,
    });
  } catch (error) {
    console.error("Update offer error:", error);

    // Clean up the new upload only if the database was not updated
    if (!offerSaved && uploadedImage?.publicId) {
      try {
        await cloudinary.uploader.destroy(uploadedImage.publicId);
      } catch (cleanupError) {
        console.error(
          "New offer image cleanup error:",
          cleanupError
        );
      }
    }

    return res.status(500).json({
      success: false,
      message: "சலுகையைத் திருத்த முடியவில்லை.",
    });
  }
};

// DELETE - Delete an offer

const deleteOffer = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "தவறான சலுகை ID.",
      });
    }

    const ownerShops = await getOwnerShops(req.user);
    const ownerShopIds = ownerShops.map((shop) => shop._id);

    const offer = await Offer.findById(id);

    if (!offer || !isOwnerShop(offer.shop, ownerShopIds)) {
      return res.status(404).json({
        success: false,
        message: "சலுகை கிடைக்கவில்லை.",
      });
    }

    // Delete the offer from MongoDB first
    await Offer.findByIdAndDelete(id);

    // Delete its Cloudinary image if one exists
    if (offer.imagePublicId) {
      try {
        await cloudinary.uploader.destroy(offer.imagePublicId);
      } catch (imageError) {
        console.error(
          "Offer image deletion error:",
          imageError
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "சலுகை வெற்றிகரமாக நீக்கப்பட்டது.",
    });
  } catch (error) {
    console.error("Delete offer error:", error);

    return res.status(500).json({
      success: false,
      message: "சலுகையை நீக்க முடியவில்லை.",
    });
  }
};

module.exports = {
  getAllOffers,
  getOwnerOffers,
  createOffer,
  updateOffer,
  deleteOffer,
};