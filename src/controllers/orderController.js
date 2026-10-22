
const mongoose = require("mongoose");

const Order = require("../models/Order");
const Shop = require("../models/Shop");
const Product = require("../models/Product");
const Offer = require("../models/Offer");
const Coupon = require("../models/Coupon");

// Round money values to 2 decimal places
const money = (value) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

// Generate a unique order number
const generateOrderNumber = () => {
  const timestamp = Date.now().toString();
  const random = Math.floor(1000 + Math.random() * 9000);

  return `ORD-${timestamp}-${random}`;
};

// Validate coupon and calculate coupon discount
const validateCoupon = async ({
  couponCode,
  shopId,
  userId,
  subtotal,
  payableAfterOffers,
  session,
}) => {
  if (!couponCode || !String(couponCode).trim()) {
    return {
      success: true,
      coupon: null,
      couponDiscountAmount: 0,
      totalAmount: money(payableAfterOffers),
      appliedCoupon: {
        coupon: null,
        code: "",
        discountAmount: 0,
      },
    };
  }

  const code = String(couponCode).trim().toUpperCase();

  let query = Coupon.findOne({ code });

  if (session) {
    query = query.session(session);
  }

  const coupon = await query;
  const now = new Date();

  if (!coupon || !coupon.isActive) {
    return {
      success: false,
      message: "இந்த coupon செல்லாது அல்லது செயல்பாட்டில் இல்லை.",
    };
  }

  if (coupon.startDate > now || coupon.endDate < now) {
    return {
      success: false,
      message: "இந்த coupon தற்போது செல்லுபடியாகவில்லை.",
    };
  }

  if (
    !coupon.appliesToAllShops &&
    !coupon.shops.some(
      (id) => id.toString() === shopId.toString()
    )
  ) {
    return {
      success: false,
      message: "இந்த coupon இந்தக் கடைக்குப் பொருந்தாது.",
    };
  }

  if (subtotal < coupon.minimumPurchase) {
    return {
      success: false,
      message: `இந்த coupon பயன்படுத்த குறைந்தது ₹${coupon.minimumPurchase} வாங்க வேண்டும்.`,
    };
  }

  if (
    coupon.usageLimit != null &&
    coupon.usedCount >= coupon.usageLimit
  ) {
    return {
      success: false,
      message: "இந்த coupon பயன்பாட்டு வரம்பை எட்டிவிட்டது.",
    };
  }

  if (
    coupon.oneUsePerUser &&
    coupon.usedBy.some(
      (id) => id.toString() === userId.toString()
    )
  ) {
    return {
      success: false,
      message: "இந்த coupon-ஐ நீங்கள் ஏற்கனவே பயன்படுத்திவிட்டீர்கள்.",
    };
  }

  let discount =
    coupon.discountType === "percentage"
      ? (payableAfterOffers * coupon.discountValue) / 100
      : coupon.discountValue;

  if (
    coupon.discountType === "percentage" &&
    coupon.maximumDiscount != null
  ) {
    discount = Math.min(discount, coupon.maximumDiscount);
  }

  const couponDiscountAmount = money(
    Math.min(discount, payableAfterOffers)
  );

  return {
    success: true,
    coupon,
    couponDiscountAmount,
    totalAmount: money(
      Math.max(0, payableAfterOffers - couponDiscountAmount)
    ),
    appliedCoupon: {
      coupon: coupon._id,
      code: coupon.code,
      discountAmount: couponDiscountAmount,
    },
  };
};

// Calculate automatic offers
const calculateOffers = async ({
  shopId,
  productSubtotals,
}) => {
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
      .filter(
        (offer) => offer.product.toString() === productId
      )
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
        offer: selected.offer._id,
        title: selected.offer.title,
        offerType: selected.offer.offerType,
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
        offer: selected.offer._id,
        title: selected.offer.title,
        offerType: selected.offer.offerType,
        discountType: selected.offer.discountType,
        discountValue: selected.offer.discountValue,
        discountAmount: selected.discount,
      });
    }
  }

  return {
    discountAmount: money(discountAmount),
    appliedOffers,
  };
};

// Validate cart and calculate server-side prices
const buildOrderItems = async ({ shopId, items, session }) => {
  const orderItems = [];
  const productSubtotals = new Map();
  const quantities = new Map();

  let subtotal = 0;

  for (const item of items) {
    if (
      !mongoose.isValidObjectId(item.productId) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1
    ) {
      throw Object.assign(
        new Error("பொருள் அல்லது அளவு சரியானதல்ல."),
        { statusCode: 400 }
      );
    }

    let productQuery = Product.findOne({
      _id: item.productId,
      shop: shopId,
    });

    if (session) {
      productQuery = productQuery.session(session);
    }

    const product = await productQuery;

    if (!product) {
      throw Object.assign(
        new Error("இந்தக் கடையில் ஒரு பொருள் கிடைக்கவில்லை."),
        { statusCode: 400 }
      );
    }

    const productId = product._id.toString();
    const newQuantity =
      (quantities.get(productId) || 0) + item.quantity;

    if (product.stock < newQuantity) {
      throw Object.assign(
        new Error(
          `${product.productName} பொருளுக்கு போதுமான இருப்பு இல்லை.`
        ),
        { statusCode: 400 }
      );
    }

    quantities.set(productId, newQuantity);

    const lineTotal = money(product.price * item.quantity);

    orderItems.push({
      product: product._id,
      productName: product.productName,
      price: product.price,
      quantity: item.quantity,
    });

    productSubtotals.set(
      productId,
      money((productSubtotals.get(productId) || 0) + lineTotal)
    );

    subtotal += lineTotal;
  }

  return {
    orderItems,
    productSubtotals,
    subtotal: money(subtotal),
  };
};

// Preview order pricing
const previewOrder = async (req, res) => {
  try {
    const { shopId, items, couponCode } = req.body;

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

    const cart = await buildOrderItems({ shopId, items });

    const offerResult = await calculateOffers({
      shopId,
      productSubtotals: cart.productSubtotals,
    });

    const discountAmount = money(
      Math.min(offerResult.discountAmount, cart.subtotal)
    );

    const payableAfterOffers = money(
      Math.max(0, cart.subtotal - discountAmount)
    );

    const couponResult = await validateCoupon({
      couponCode,
      shopId,
      userId: req.user._id,
      subtotal: cart.subtotal,
      payableAfterOffers,
    });

    if (!couponResult.success) {
      return res.status(400).json({
        success: false,
        message: couponResult.message,
      });
    }

    return res.status(200).json({
      success: true,
      pricing: {
        subtotal: cart.subtotal,
        discountAmount,
        couponDiscountAmount: couponResult.couponDiscountAmount,
        totalDiscountAmount: money(
          discountAmount + couponResult.couponDiscountAmount
        ),
        totalAmount: couponResult.totalAmount,
        appliedOffers: offerResult.appliedOffers,
        appliedCoupon: couponResult.appliedCoupon,
      },
    });
  } catch (error) {
    console.error("Preview order error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.statusCode === 400
          ? error.message
          : "ஆஃபர் விவரங்களைக் கணக்கிட முடியவில்லை.",
    });
  }
};

// Create order for the logged-in customer
const createOrder = async (req, res) => {
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
    couponCode,
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

  if (!["cash", "upi", "card", "other"].includes(paymentMethod)) {
    return res.status(400).json({
      success: false,
      message: "கட்டண முறை சரியானதல்ல.",
    });
  }

  const session = await mongoose.startSession();
  let createdOrder;

  try {
    await session.withTransaction(async () => {
      const shop = await Shop.findById(shopId).session(session);

      if (!shop) {
        throw Object.assign(
          new Error("கடை கிடைக்கவில்லை."),
          { statusCode: 404 }
        );
      }

      const cart = await buildOrderItems({
        shopId,
        items,
        session,
      });

      const offerResult = await calculateOffers({
        shopId,
        productSubtotals: cart.productSubtotals,
      });

      const discountAmount = money(
        Math.min(offerResult.discountAmount, cart.subtotal)
      );

      const payableAfterOffers = money(
        Math.max(0, cart.subtotal - discountAmount)
      );

      const couponResult = await validateCoupon({
        couponCode,
        shopId,
        userId: req.user._id,
        subtotal: cart.subtotal,
        payableAfterOffers,
        session,
      });

      if (!couponResult.success) {
        throw Object.assign(
          new Error(couponResult.message),
          { statusCode: 400 }
        );
      }

      if (couponResult.coupon) {
        const coupon = couponResult.coupon;
        const conditions = {
          _id: coupon._id,
          isActive: true,
          startDate: { $lte: new Date() },
          endDate: { $gte: new Date() },
        };

        if (coupon.usageLimit != null) {
          conditions.$expr = {
            $lt: ["$usedCount", coupon.usageLimit],
          };
        }

        if (coupon.oneUsePerUser) {
          conditions.usedBy = { $ne: req.user._id };
        }

        const update = {
          $inc: { usedCount: 1 },
        };

        if (coupon.oneUsePerUser) {
          update.$addToSet = { usedBy: req.user._id };
        }

        const updatedCoupon = await Coupon.findOneAndUpdate(
          conditions,
          update,
          { new: true, session }
        );

        if (!updatedCoupon) {
          throw Object.assign(
            new Error("இந்த coupon இனி பயன்படுத்த முடியாது."),
            { statusCode: 400 }
          );
        }
      }

      const orders = await Order.create(
        [
          {
            orderNumber: generateOrderNumber(),
            shop: shopId,
            customer: req.user._id,
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
            items: cart.orderItems,
            subtotal: cart.subtotal,
            discountAmount,
            appliedOffers: offerResult.appliedOffers,
            couponDiscountAmount: couponResult.couponDiscountAmount,
            appliedCoupon: couponResult.appliedCoupon,
            totalAmount: couponResult.totalAmount,
            paymentMethod,
            notes: typeof notes === "string" ? notes.trim() : "",
          },
        ],
        { session }
      );

      createdOrder = orders[0];
    });

    return res.status(201).json({
      success: true,
      message: "ஆர்டர் வெற்றிகரமாக பதிவு செய்யப்பட்டது.",
      order: createdOrder,
    });
  } catch (error) {
    console.error("Create order error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.statusCode
          ? error.message
          : "ஆர்டரை பதிவு செய்ய முடியவில்லை.",
    });
  } finally {
    await session.endSession();
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
      message: "ஆர்டர்களைப் பெற முடியவில்லை.",
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


// Update order item quantities before processing starts
const updateOwnerOrderItems = async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID.",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one item is required.",
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

    if (!["placed", "confirmed"].includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: "Quantity can only be changed before processing.",
      });
    }

    if (order.stockDeducted) {
      return res.status(400).json({
        success: false,
        message: "Stock has already been deducted.",
      });
    }

    // Only allow products that already exist in this order.
    const requestedQuantities = new Map();

    for (const item of items) {
      if (
        !mongoose.isValidObjectId(item.productId) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid product or quantity.",
        });
      }

      const productId = item.productId.toString();

      requestedQuantities.set(
        productId,
        (requestedQuantities.get(productId) || 0) + item.quantity
      );
    }

    const existingProductIds = new Set(
      order.items.map((item) => item.product.toString())
    );

    for (const productId of requestedQuantities.keys()) {
      if (!existingProductIds.has(productId)) {
        return res.status(400).json({
          success: false,
          message: "New products cannot be added through quantity editing.",
        });
      }
    }

    const updatedItems = [];

    for (const oldItem of order.items) {
      const productId = oldItem.product.toString();
      const quantity = requestedQuantities.get(productId);

      // A missing product means the client omitted an existing order item.
      if (quantity === undefined) {
        return res.status(400).json({
          success: false,
          message: "Please include every existing order item.",
        });
      }

      const product = await Product.findOne({
        _id: oldItem.product,
        shop: order.shop,
      });

      if (!product) {
        return res.status(400).json({
          success: false,
          message: `${oldItem.productName} is no longer available.`,
        });
      }

      if (product.stock < quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${oldItem.productName}.`,
        });
      }

      updatedItems.push({
        product: oldItem.product,
        productName: oldItem.productName,
        price: oldItem.price,
        quantity,
      });
    }

    const newSubtotal = money(
      updatedItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      )
    );

    // Recalculate current automatic offers without changing coupon usage.
    const productSubtotals = new Map();

    for (const item of updatedItems) {
      const productId = item.product.toString();
      const lineTotal = money(item.price * item.quantity);

      productSubtotals.set(
        productId,
        money((productSubtotals.get(productId) || 0) + lineTotal)
      );
    }

    const offerResult = await calculateOffers({
      shopId: order.shop,
      productSubtotals,
    });

    const discountAmount = money(
      Math.min(offerResult.discountAmount, newSubtotal)
    );

    const payableAfterOffers = money(
      Math.max(0, newSubtotal - discountAmount)
    );

    let couponDiscountAmount = 0;
    let appliedCoupon = {
      coupon: null,
      code: "",
      discountAmount: 0,
    };

    // Preserve and recalculate the coupon already attached to this order.
    if (order.appliedCoupon?.coupon) {
      const coupon = await Coupon.findById(order.appliedCoupon.coupon);
      const now = new Date();

      if (
        !coupon ||
        !coupon.isActive ||
        coupon.startDate > now ||
        coupon.endDate < now ||
        (!coupon.appliesToAllShops &&
          !coupon.shops.some(
            (shopId) => shopId.toString() === order.shop.toString()
          )) ||
        newSubtotal < coupon.minimumPurchase
      ) {
        return res.status(400).json({
          success: false,
          message:
            "The existing coupon is no longer valid for this updated order. Quantity was not changed.",
        });
      }

      let couponDiscount =
        coupon.discountType === "percentage"
          ? (payableAfterOffers * coupon.discountValue) / 100
          : coupon.discountValue;

      if (
        coupon.discountType === "percentage" &&
        coupon.maximumDiscount != null
      ) {
        couponDiscount = Math.min(
          couponDiscount,
          coupon.maximumDiscount
        );
      }

      couponDiscountAmount = money(
        Math.min(couponDiscount, payableAfterOffers)
      );

      appliedCoupon = {
        coupon: coupon._id,
        code: coupon.code,
        discountAmount: couponDiscountAmount,
      };
    }

    order.items = updatedItems;
    order.subtotal = newSubtotal;
    order.discountAmount = discountAmount;
    order.appliedOffers = offerResult.appliedOffers;
    order.couponDiscountAmount = couponDiscountAmount;
    order.appliedCoupon = appliedCoupon;
    order.totalAmount = money(
      Math.max(0, payableAfterOffers - couponDiscountAmount)
    );

    await order.save();

    return res.status(200).json({
      success: true,
      message: "Order quantities updated successfully.",
      order,
    });
  } catch (error) {
    console.error("Update order quantities error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update order quantities.",
    });
  }
};



// Update order status and manage stock safely
const updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { orderStatus } = req.body;

  const allowedStatuses = [
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

  const session = await mongoose.startSession();

  try {
    let updatedOrder;

    await session.withTransaction(async () => {
      const shops = await Shop.find({
        mobileNumber: req.user.phoneNumber,
      })
        .select("_id")
        .session(session);

      const shopIds = shops.map((shop) => shop._id);

      const order = await Order.findOne({
        _id: id,
        shop: { $in: shopIds },
      }).session(session);

      if (!order) {
        throw Object.assign(new Error("Order not found."), {
          statusCode: 404,
        });
      }

      const allowedTransitions = {
        placed: ["confirmed", "cancelled"],
        confirmed: ["processing", "cancelled"],
        processing: ["ready", "cancelled"],
        ready: ["delivered", "cancelled"],
        delivered: [],
        cancelled: [],
      };

      if (!allowedTransitions[order.orderStatus].includes(orderStatus)) {
        throw Object.assign(
          new Error(
            `Cannot change order status from ${order.orderStatus} to ${orderStatus}.`
          ),
          { statusCode: 400 }
        );
      }

      // Deduct stock exactly when processing begins.
      if (orderStatus === "processing" && !order.stockDeducted) {
        // Combine duplicate product entries before stock operations.
        const quantities = new Map();

        for (const item of order.items) {
          const productId = item.product.toString();

          quantities.set(
            productId,
            (quantities.get(productId) || 0) + item.quantity
          );
        }

        for (const [productId, quantity] of quantities) {
          const product = await Product.findOneAndUpdate(
            {
              _id: productId,
              shop: order.shop,
              stock: { $gte: quantity },
            },
            {
              $inc: { stock: -quantity },
            },
            {
              new: true,
              session,
            }
          );

          if (!product) {
            throw Object.assign(
              new Error(
                "Insufficient stock. The order cannot move to processing."
              ),
              { statusCode: 400 }
            );
          }
        }

        order.stockDeducted = true;
      }

      // Restore stock only if it was previously deducted.
      if (orderStatus === "cancelled" && order.stockDeducted) {
        const quantities = new Map();

        for (const item of order.items) {
          const productId = item.product.toString();

          quantities.set(
            productId,
            (quantities.get(productId) || 0) + item.quantity
          );
        }

        for (const [productId, quantity] of quantities) {
          const product = await Product.findOneAndUpdate(
            {
              _id: productId,
              shop: order.shop,
            },
            {
              $inc: { stock: quantity },
            },
            {
              new: true,
              session,
            }
          );

          if (!product) {
            throw Object.assign(
              new Error(
                "A product could not be found while restoring stock."
              ),
              { statusCode: 400 }
            );
          }
        }

        order.stockDeducted = false;
      }

      order.orderStatus = orderStatus;
      await order.save({ session });

      updatedOrder = order;
    });

    return res.status(200).json({
      success: true,
      message: "Order status updated successfully.",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Update order status error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Failed to update order status.",
    });
  } finally {
    await session.endSession();
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
  updateOwnerOrderItems,
};
