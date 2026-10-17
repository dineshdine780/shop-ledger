const Shop = require("../models/Shop");
const User = require("../models/User");

// CREATE - Add a new shop
// CREATE - Add a new shop
const createShop = async (req, res) => {
  try {
    const {
      shopName,
      category,
      area,
      pincode,
      mobileNumber,
    } = req.body;

    if (
      !shopName ||
      !category ||
      !area ||
      !pincode ||
      !mobileNumber
    ) {
      return res.status(400).json({
        success: false,
        message: "All shop fields are required",
      });
    }

    // Validate shop mobile number
    if (!/^[6-9]\d{9}$/.test(mobileNumber)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid 10-digit mobile number",
      });
    }

    const shop = await Shop.create({
      shopName,
      category,
      area,
      pincode,
      mobileNumber,
      owner: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: "Shop created successfully",
      shop,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ADMIN DASHBOARD - Get shop statistics
const getShopStats = async (req, res) => {
  try {
    const totalShops = await Shop.countDocuments();

    const categoryStats = await Shop.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalShops,
        totalCategories: categoryStats.length,
        categoryStats,
      },
    });
  } catch (error) {
    console.error("Dashboard statistics error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard statistics",
    });
  }
};

// READ - Get all shops
const getShops = async (req, res) => {
  try {
    const shops = await Shop.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: shops.length,
      shops,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// READ - Get one shop by ID
const getShopById = async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id);

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    res.status(200).json({
      success: true,
      shop,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Invalid shop ID",
    });
  }
};

// UPDATE - Edit a shop
const updateShop = async (req, res) => {
  try {
    const shop = await Shop.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Shop updated successfully",
      shop,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// DELETE - Remove a shop
const deleteShop = async (req, res) => {
  try {
    const shop = await Shop.findByIdAndDelete(req.params.id);

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Shop deleted successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Invalid shop ID",
    });
  }
};

module.exports = {
  createShop,
  getShops,
  getShopById,
  updateShop,
  deleteShop,
  getShopStats,
};