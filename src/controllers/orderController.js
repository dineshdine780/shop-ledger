const mongoose = require("mongoose");
const Order = require("../models/Order");
const Shop = require("../models/Shop");
const Product = require("../models/Product");
const Offer = require("../models/Offer");

// Generate a unique order number
const generateOrderNumber = () => {
  const timestamp = Date.now().toString();
  const random = Math.floor(1000 + Math.random() * 9000);

  return `ORD-${timestamp}-${random}`;
};




const previewOrder = async (req, res) => {
  try {
    const { shopId, items } = req.body;

    if (!mongoose.isValidObjectId(shopId)) {
      return res.status(400).json({
        success: false,
        message: "கடையின் ID சரியானதல்ல.",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "குறைந்தது ஒரு பொருளையாவது தேர்வு செய்யுங்கள்.",
      });
    }

    const shop = await Shop.findById(shopId);

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: "கடை கிடைக்கவில்லை.",
      });
    }

    const productSubtotals = new Map();
    const productDetails = new Map();
    let subtotal = 0;

    for (const item of items) {
      if (
        !mongoose.isValidObjectId(item.productId) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1
      ) {
        return res.status(400).json({
          success: false,
          message: "பொருள் அல்லது அளவு சரியானதல்ல.",
        });
      }

      const product = await Product.findOne({
        _id: item.productId,
        shop: shopId,
      });

      if (!product) {
        return res.status(400).json({
          success: false,
          message: "இந்தக் கடையில் ஒரு பொருள் கிடைக்கவில்லை.",
        });
      }

      const id = product._id.toString();
      const currentQuantity = productDetails.get(id)?.quantity || 0;
      const quantity = currentQuantity + item.quantity;

      if (product.stock < quantity) {
        return res.status(400).json({
          success: false,
          message: `${product.productName} பொருளுக்கு போதுமான இருப்பு இல்லை.`,
        });
      }

      const lineTotal = Math.round(
        (product.price * item.quantity + Number.EPSILON) * 100
      ) / 100;

      productSubtotals.set(
        id,
        (productSubtotals.get(id) || 0) + lineTotal
      );

      productDetails.set(id, {
        productName: product.productName,
        quantity,
      });

      subtotal += lineTotal;
    }

    const money = (value) =>
      Math.round((value + Number.EPSILON) * 100) / 100;

    subtotal = money(subtotal);

    const now = new Date();

    const offers = await Offer.find({
      shop: shopId,
      startDate: { $lte: now },
      endDate: { $gte: now },
    });

    const calculateDiscount = (offer, eligibleAmount) => {
      if (eligibleAmount < (offer.minimumPurchase || 0)) {
        return 0;
      }

      let discount =
        offer.discountType === "percentage"
          ? (eligibleAmount * offer.discountValue) / 100
          : offer.discountValue;

      if (
        offer.discountType === "percentage" &&
        offer.maximumDiscount != null
      ) {
        discount = Math.min(discount, offer.maximumDiscount);
      }

      return money(Math.min(discount, eligibleAmount));
    };

    const productOffers = offers.filter(
      (offer) =>
        offer.offerType === "product" &&
        offer.product &&
        productSubtotals.has(offer.product.toString())
    );

    const shopOffers = offers.filter(
      (offer) => offer.offerType === "shop"
    );

    const appliedOffers = [];
    let discountAmount = 0;
    let remainingSubtotal = 0;

    for (const [productId, productSubtotal] of productSubtotals) {
      const matchingOffers = productOffers
        .filter((offer) => offer.product.toString() === productId)
        .map((offer) => ({
          offer,
          discount: calculateDiscount(offer, productSubtotal),
        }))
        .filter((entry) => entry.discount > 0)
        .sort((a, b) => b.discount - a.discount);

      if (matchingOffers.length > 0) {
        const selected = matchingOffers[0];

        discountAmount += selected.discount;

        appliedOffers.push({
          title: selected.offer.title,
          offerType: "product",
          discountType: selected.offer.discountType,
          discountValue: selected.offer.discountValue,
          discountAmount: selected.discount,
        });
      } else {
        remainingSubtotal += productSubtotal;
      }
    }

    if (remainingSubtotal > 0) {
      const matchingOffers = shopOffers
        .map((offer) => ({
          offer,
          discount: calculateDiscount(offer, remainingSubtotal),
        }))
        .filter((entry) => entry.discount > 0)
        .sort((a, b) => b.discount - a.discount);

      if (matchingOffers.length > 0) {
        const selected = matchingOffers[0];

        discountAmount += selected.discount;

        appliedOffers.push({
          title: selected.offer.title,
          offerType: "shop",
          discountType: selected.offer.discountType,
          discountValue: selected.offer.discountValue,
          discountAmount: selected.discount,
        });
      }
    }

    discountAmount = money(Math.min(discountAmount, subtotal));

    return res.status(200).json({
      success: true,
      pricing: {
        subtotal,
        discountAmount,
        totalAmount: money(Math.max(0, subtotal - discountAmount)),
        appliedOffers,
      },
    });
  } catch (error) {
    console.error("Preview order error:", error);

    return res.status(500).json({
      success: false,
      message: "ஆஃபர் விவரங்களைக் கணக்கிட முடியவில்லை.",
    });
  }
};



// Create an order for the logged-in customer

const createOrder = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "ஆர்டர் செய்ய முதலில் உள்நுழையவும்.",
      });
    }

    const {
      shopId,
      items,
      customerName,
      customerPhone,
      paymentMethod = "cash",
      notes = "",
    } = req.body;

    if (!mongoose.isValidObjectId(shopId)) {
      return res.status(400).json({
        success: false,
        message: "கடையின் ID சரியானதல்ல.",
      });
    }

    if (!customerName?.trim() || !customerPhone?.trim()) {
      return res.status(400).json({
        success: false,
        message: "பெயர் மற்றும் தொலைபேசி எண் அவசியம்.",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "குறைந்தது ஒரு பொருளையாவது தேர்வு செய்யுங்கள்.",
      });
    }

    const allowedPaymentMethods = ["cash", "upi", "card", "other"];

    if (!allowedPaymentMethods.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "கட்டண முறை சரியானதல்ல.",
      });
    }

    const shop = await Shop.findById(shopId);

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: "கடை கிடைக்கவில்லை.",
      });
    }

    const orderItems = [];
    const productSubtotals = new Map();
    let subtotal = 0;

    // Validate products and calculate all prices on the server.
    for (const item of items) {
      if (
        !mongoose.isValidObjectId(item.productId) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1
      ) {
        return res.status(400).json({
          success: false,
          message: "பொருள் அல்லது அளவு சரியானதல்ல.",
        });
      }

      // Prevent duplicate product entries from bypassing stock checks.
      const product = await Product.findOne({
        _id: item.productId,
        shop: shopId,
      });

      if (!product) {
        return res.status(400).json({
          success: false,
          message: "இந்தக் கடையில் ஒரு பொருள் கிடைக்கவில்லை.",
        });
      }

      const existingQuantity = orderItems
        .filter((orderItem) => orderItem.product.toString() === product._id.toString())
        .reduce((sum, orderItem) => sum + orderItem.quantity, 0);

      if (product.stock < existingQuantity + item.quantity) {
        return res.status(400).json({
          success: false,
          message: `${product.productName} பொருளுக்கு போதுமான இருப்பு இல்லை.`,
        });
      }

      const lineTotal = Math.round(
        (product.price * item.quantity + Number.EPSILON) * 100
      ) / 100;

      orderItems.push({
        product: product._id,
        productName: product.productName,
        price: product.price,
        quantity: item.quantity,
      });

      productSubtotals.set(
        product._id.toString(),
        (productSubtotals.get(product._id.toString()) || 0) + lineTotal
      );

      subtotal += lineTotal;
    }

    subtotal = Math.round((subtotal + Number.EPSILON) * 100) / 100;

    // Use a consistent server-side time for offer validation.
    const now = new Date();

    const offers = await Offer.find({
      shop: shopId,
      startDate: { $lte: now },
      endDate: { $gte: now },
    });

    // Select at most one offer for each eligible amount.
    // Product-specific offers take precedence for their own products;
    // shop-wide offers apply to products without a product offer.
    const money = (value) =>
      Math.round((value + Number.EPSILON) * 100) / 100;

    const calculateDiscount = (offer, eligibleAmount) => {
      if (eligibleAmount < (offer.minimumPurchase || 0)) {
        return 0;
      }

      let discount =
        offer.discountType === "percentage"
          ? (eligibleAmount * offer.discountValue) / 100
          : offer.discountValue;

      if (
        offer.discountType === "percentage" &&
        offer.maximumDiscount != null
      ) {
        discount = Math.min(discount, offer.maximumDiscount);
      }

      return money(Math.min(discount, eligibleAmount));
    };

    const productOffers = offers.filter(
      (offer) =>
        offer.offerType === "product" &&
        offer.product &&
        productSubtotals.has(offer.product.toString())
    );

    const shopOffers = offers.filter(
      (offer) => offer.offerType === "shop"
    );

    const appliedOffers = [];
    let discountAmount = 0;
    let remainingEligibleSubtotal = 0;

    for (const [productId, productSubtotal] of productSubtotals) {
      const matchingProductOffers = productOffers.filter(
        (offer) => offer.product.toString() === productId
      );

      const validProductOffers = matchingProductOffers
        .map((offer) => ({
          offer,
          discount: calculateDiscount(offer, productSubtotal),
        }))
        .filter((entry) => entry.discount > 0)
        .sort((a, b) => b.discount - a.discount);

      if (validProductOffers.length > 0) {
        const selected = validProductOffers[0];

        discountAmount += selected.discount;

        appliedOffers.push({
          offer: selected.offer._id,
          title: selected.offer.title,
          offerType: selected.offer.offerType,
          discountType: selected.offer.discountType,
          discountValue: selected.offer.discountValue,
          discountAmount: selected.discount,
        });
      } else {
        remainingEligibleSubtotal += productSubtotal;
      }
    }

    // Shop-wide offers apply only to the remaining amount,
    // preventing the same product from receiving two discounts.
    if (remainingEligibleSubtotal > 0) {
      const validShopOffers = shopOffers
        .map((offer) => ({
          offer,
          discount: calculateDiscount(offer, remainingEligibleSubtotal),
        }))
        .filter((entry) => entry.discount > 0)
        .sort((a, b) => b.discount - a.discount);

      if (validShopOffers.length > 0) {
        const selected = validShopOffers[0];

        discountAmount += selected.discount;

        appliedOffers.push({
          offer: selected.offer._id,
          title: selected.offer.title,
          offerType: selected.offer.offerType,
          discountType: selected.offer.discountType,
          discountValue: selected.offer.discountValue,
          discountAmount: selected.discount,
        });
      }
    }

    discountAmount = money(Math.min(discountAmount, subtotal));
    const totalAmount = money(Math.max(0, subtotal - discountAmount));

    const order = await Order.create({
      orderNumber: generateOrderNumber(),
      shop: shopId,
      customer: req.user._id,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      items: orderItems,
      subtotal,
      discountAmount,
      appliedOffers,
      totalAmount,
      paymentMethod,
      notes: typeof notes === "string" ? notes.trim() : "",
    });

    return res.status(201).json({
      success: true,
      message: "ஆர்டர் வெற்றிகரமாக பதிவு செய்யப்பட்டது.",
      order,
    });
  } catch (error) {
    console.error("Create order error:", error);

    return res.status(500).json({
      success: false,
      message: "ஆர்டரை பதிவு செய்ய முடியவில்லை.",
    });
  }
};


// Get orders belonging to the logged-in customer
const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      customer: req.user._id,
    })
      .populate("shop", "shopName area mobileNumber")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("Get customer orders error:", error);

    return res.status(500).json({
      success: false,
      message: "உங்கள் ஆர்டர்களைப் பெற முடியவில்லை.",
    });
  }
};

// Get orders belonging to the logged-in owner
const getOwnerOrders = async (req, res) => {
  try {
    const shops = await Shop.find({
      mobileNumber: req.user.phoneNumber,
    }).select("_id");

    const shopIds = shops.map((shop) => shop._id);

    const orders = await Order.find({
      shop: { $in: shopIds },
    })
      .populate("shop", "shopName")
      .populate("customer", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("Get owner orders error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch orders.",
    });
  }
};

// Update order status
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { orderStatus } = req.body;

    const allowedStatuses = [
      "placed",
      "confirmed",
      "processing",
      "ready",
      "delivered",
      "cancelled",
    ];

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID.",
      });
    }

    if (!allowedStatuses.includes(orderStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status.",
      });
    }

    const shops = await Shop.find({
      mobileNumber: req.user.phoneNumber,
    }).select("_id");

    const shopIds = shops.map((shop) => shop._id);

    const order = await Order.findOne({
      _id: id,
      shop: { $in: shopIds },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    order.orderStatus = orderStatus;
    await order.save();

    return res.status(200).json({
      success: true,
      message: "Order status updated successfully.",
      order,
    });
  } catch (error) {
    console.error("Update order status error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update order status.",
    });
  }
};

// Update payment status
const updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;

    const allowedStatuses = [
      "pending",
      "paid",
      "failed",
      "refunded",
    ];

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID.",
      });
    }

    if (!allowedStatuses.includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment status.",
      });
    }

    const shops = await Shop.find({
      mobileNumber: req.user.phoneNumber,
    }).select("_id");

    const shopIds = shops.map((shop) => shop._id);

    const order = await Order.findOne({
      _id: id,
      shop: { $in: shopIds },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    order.paymentStatus = paymentStatus;
    await order.save();

    return res.status(200).json({
      success: true,
      message: "Payment status updated successfully.",
      order,
    });
  } catch (error) {
    console.error("Update payment status error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update payment status.",
    });
  }
};

module.exports = {
  createOrder,
  previewOrder,
  getMyOrders,
  getOwnerOrders,
  updateOrderStatus,
  updatePaymentStatus,
};