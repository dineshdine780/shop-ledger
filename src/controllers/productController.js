const mongoose = require("mongoose");
const Product = require("../models/Product");
const Shop = require("../models/Shop");

// GET - Owner's products from their matching shops
const getOwnerProducts = async (req, res) => {
  try {
    const ownerShops = await Shop.find({
      mobileNumber: req.user.phoneNumber,
    }).select("_id");

    const shopIds = ownerShops.map((shop) => shop._id);

    const products = await Product.find({
      shop: { $in: shopIds },
    })
      .populate("shop", "shopName")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error("Fetch owner products error:", error.message);

    return res.status(500).json({
      success: false,
      message: "பொருட்களைப் பெற முடியவில்லை.",
    });
  }
};

// POST - Create a new product
const createProduct = async (req, res) => {
  try {
    const { productName, category, price, stock, shopId } = req.body;

    if (
      !productName?.trim() ||
      !category?.trim() ||
      price === undefined ||
      !shopId
    ) {
      return res.status(400).json({
        success: false,
        message: "அனைத்து கட்டாய விவரங்களையும் உள்ளிடவும்.",
      });
    }

    if (
      !Number.isFinite(Number(price)) ||
      Number(price) < 0 ||
      (stock !== undefined &&
        (!Number.isFinite(Number(stock)) || Number(stock) < 0))
    ) {
      return res.status(400).json({
        success: false,
        message: "விலை மற்றும் இருப்பு சரியாக இருக்க வேண்டும்.",
      });
    }

    if (!mongoose.isValidObjectId(shopId)) {
      return res.status(400).json({
        success: false,
        message: "தேர்ந்தெடுத்த கடை சரியானதல்ல.",
      });
    }

    const shop = await Shop.findOne({
      _id: shopId,
      mobileNumber: req.user.phoneNumber,
    });

    if (!shop) {
      return res.status(403).json({
        success: false,
        message: "இந்தக் கடையில் பொருள் சேர்க்க அனுமதி இல்லை.",
      });
    }

    const product = await Product.create({
      productName: productName.trim(),
      category: category.trim(),
      price: Number(price),
      stock: stock === undefined ? 0 : Number(stock),
      shop: shop._id,
    });

    return res.status(201).json({
      success: true,
      message: "பொருள் வெற்றிகரமாகச் சேர்க்கப்பட்டது.",
      product,
    });
  } catch (error) {
    console.error("Create product error:", error.message);

    return res.status(500).json({
      success: false,
      message: "பொருளைச் சேர்க்க முடியவில்லை.",
    });
  }
};

// PUT - Update an owner's product
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { productName, category, price, stock } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "பொருளின் ID சரியானதல்ல.",
      });
    }

    if (
      !productName?.trim() ||
      !category?.trim() ||
      price === undefined ||
      !Number.isFinite(Number(price)) ||
      Number(price) < 0 ||
      (stock !== undefined &&
        (!Number.isFinite(Number(stock)) || Number(stock) < 0))
    ) {
      return res.status(400).json({
        success: false,
        message: "சரியான பொருள் விவரங்களை உள்ளிடவும்.",
      });
    }

    const ownerShops = await Shop.find({
      mobileNumber: req.user.phoneNumber,
    }).select("_id");

    const shopIds = ownerShops.map((shop) => shop._id);

    const product = await Product.findOne({
      _id: id,
      shop: { $in: shopIds },
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "பொருள் கிடைக்கவில்லை.",
      });
    }

    product.productName = productName.trim();
    product.category = category.trim();
    product.price = Number(price);

    if (stock !== undefined) {
      product.stock = Number(stock);
    }

    await product.save();

    return res.status(200).json({
      success: true,
      message: "பொருள் வெற்றிகரமாகத் திருத்தப்பட்டது.",
      product,
    });
  } catch (error) {
    console.error("Update product error:", error.message);

    return res.status(500).json({
      success: false,
      message: "பொருளைத் திருத்த முடியவில்லை.",
    });
  }
};

// GET - Products belonging to a selected shop (for users)
const getShopProducts = async (req, res) => {
  try {
    const { shopId } = req.params;

    if (!mongoose.isValidObjectId(shopId)) {
      return res.status(400).json({
        success: false,
        message: "கடையின் ID சரியானதல்ல.",
      });
    }

    const shop = await Shop.findById(shopId).select(
      "shopName category area pincode"
    );

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: "கடை கிடைக்கவில்லை.",
      });
    }

    const products = await Product.find({
      shop: shopId,
      stock: { $gt: 0 },
    })
      .select("productName category price stock shop")
      .sort({ productName: 1 });

    return res.status(200).json({
      success: true,
      shop,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error("Fetch shop products error:", error.message);

    return res.status(500).json({
      success: false,
      message: "இந்தக் கடையின் பொருட்களைப் பெற முடியவில்லை.",
    });
  }
};

// DELETE - Delete an owner's product
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "பொருளின் ID சரியானதல்ல.",
      });
    }

    const ownerShops = await Shop.find({
      mobileNumber: req.user.phoneNumber,
    }).select("_id");

    const shopIds = ownerShops.map((shop) => shop._id);

    const product = await Product.findOne({
      _id: id,
      shop: { $in: shopIds },
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "பொருள் கிடைக்கவில்லை.",
      });
    }

    await Product.deleteOne({ _id: product._id });

    return res.status(200).json({
      success: true,
      message: "பொருள் வெற்றிகரமாக நீக்கப்பட்டது.",
    });
  } catch (error) {
    console.error("Delete product error:", error.message);

    return res.status(500).json({
      success: false,
      message: "பொருளை நீக்க முடியவில்லை.",
    });
  }
};



module.exports = {
  getOwnerProducts,
  getShopProducts,
  createProduct,
  updateProduct,
  deleteProduct,
};