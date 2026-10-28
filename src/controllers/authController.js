
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const Shop = require("../models/Shop");
const LoginHistory = require("../models/LoginHistory");
const { verifyCaptcha } = require("../utils/captcha");

const PHONE_REGEX = /^[6-9]\d{9}$/;

const normalizePhone = (value) =>
  typeof value === "string" ? value.trim() : "";

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  phoneNumber: user.phoneNumber,
  role: user.role,
  shop: user.shop || null,
});

const createToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing from .env");
  }

  return jwt.sign(
    { userId: user._id.toString() },
    process.env.JWT_SECRET,
    {
      expiresIn: "1h",
      issuer: "kadai-edu",
      audience: "kadai-edu-users",
    }
  );
};

const recordLogin = async (req, data) => {
  try {
    await LoginHistory.create({
      phoneNumber: data.phoneNumber || "unknown",
      role: data.role || null,
      user: data.userId || null,
      status: data.status,
      reason: data.reason,
      ipAddress: req.ip || null,
      userAgent: req.get("user-agent") || null,
    });
  } catch (error) {
    console.error("Login history error:", error.message);
  }
};

// Validate CAPTCHA on the backend.
const validateCaptcha = (req, res) => {
  const { captchaId, captchaAnswer } = req.body;

  const valid =
    typeof captchaId === "string" &&
    typeof captchaAnswer === "string" &&
    verifyCaptcha(captchaId, captchaAnswer);

  if (!valid) {
    res.status(400).json({
      success: false,
      message:
        "CAPTCHA தவறானது அல்லது காலாவதியாகிவிட்டது. புதிய CAPTCHA முயற்சிக்கவும்.",
    });

    return false;
  }

  return true;
};

// ADMIN REGISTRATION — initial setup only.
const registerUser = async (req, res) => {
  try {
    const { name, phoneNumber, password, role } = req.body;

    if (role !== "admin") {
      return res.status(400).json({
        success: false,
        message: "Only admin registration is allowed",
      });
    }

    const setupKey = req.headers["x-admin-setup-key"];

    if (
      !process.env.ADMIN_SETUP_KEY ||
      !setupKey ||
      setupKey !== process.env.ADMIN_SETUP_KEY
    ) {
      return res.status(403).json({
        success: false,
        message: "Admin registration is not authorized",
      });
    }

    if (!validateCaptcha(req, res)) return;

    const phone = normalizePhone(phoneNumber);

    if (
      typeof name !== "string" ||
      !name.trim() ||
      !PHONE_REGEX.test(phone) ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 72
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Enter a valid name, phone number and password (8–72 characters)",
      });
    }

    if (await User.exists({ role: "admin" })) {
      return res.status(409).json({
        success: false,
        message: "An admin account already exists",
      });
    }

    if (await User.exists({ phoneNumber: phone })) {
      return res.status(409).json({
        success: false,
        message: "Phone number is already registered",
      });
    }

    const admin = await User.create({
      name: name.trim(),
      phoneNumber: phone,
      password: await bcrypt.hash(password, 12),
      role: "admin",
    });

    return res.status(201).json({
      success: true,
      message: "Admin registered successfully",
      user: publicUser(admin),
    });
  } catch (error) {
    console.error("Admin registration error:", error.message);

    return res.status(error.code === 11000 ? 409 : 500).json({
      success: false,
      message:
        error.code === 11000
          ? "Phone number is already registered"
          : "Admin registration failed",
    });
  }
};

// CUSTOMER REGISTRATION — CAPTCHA + details.
const registerCustomer = async (req, res) => {
  try {
    if (!validateCaptcha(req, res)) return;

    const { name, phoneNumber, password } = req.body;
    const phone = normalizePhone(phoneNumber);

    if (
      typeof name !== "string" ||
      !name.trim() ||
      !PHONE_REGEX.test(phone) ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 72
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Enter a valid name, phone number and password (8–72 characters)",
      });
    }

    if (await User.exists({ phoneNumber: phone })) {
      return res.status(409).json({
        success: false,
        message: "This phone number is already registered",
      });
    }

    const user = await User.create({
      name: name.trim(),
      phoneNumber: phone,
      password: await bcrypt.hash(password, 12),
      role: "user",
    });

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Customer registration error:", error.message);

    return res.status(error.code === 11000 ? 409 : 500).json({
      success: false,
      message:
        error.code === 11000
          ? "This phone number is already registered"
          : "Could not register user",
    });
  }
};

// OWNER REGISTRATION — CAPTCHA + matching unassigned shop.

const registerOwner = async (req, res) => {
  let createdOwnerId = null;

  try {
    if (!validateCaptcha(req, res)) return;

    const { name, phoneNumber, password } = req.body;
    const phone = normalizePhone(phoneNumber);

    if (
      typeof name !== "string" ||
      !name.trim() ||
      !PHONE_REGEX.test(phone) ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 72
    ) {
      return res.status(400).json({
        success: false,
        message:
          "சரியான பெயர், 10 இலக்க மொபைல் எண் மற்றும் password உள்ளிடவும்.",
      });
    }

    // ஏற்கெனவே இந்த எண்ணில் கணக்கு உள்ளதா?
    if (await User.exists({ phoneNumber: phone })) {
      return res.status(409).json({
        success: false,
        message: "இந்த மொபைல் எண்ணில் ஏற்கெனவே கணக்கு உள்ளது.",
      });
    }

    // இந்த எண்ணுடன் பொருந்தும், Owner இல்லாத கடையைக் கண்டறிதல்
    const shop = await Shop.findOne({
      mobileNumber: phone,
      owner: null,
    });

    if (!shop) {
      return res.status(404).json({
        success: false,
        message:
          "இந்த மொபைல் எண்ணுடன் இணைக்கப்படாத கடை கிடைக்கவில்லை.",
      });
    }

    // Owner account உருவாக்குதல்
    const owner = await User.create({
      name: name.trim(),
      phoneNumber: phone,
      password: await bcrypt.hash(password, 12),
      role: "owner",
      shop: shop._id,
    });

    createdOwnerId = owner._id;

    // Owner இல்லாத கடைக்கு மட்டுமே இணைக்க அனுமதி
    const linkedShop = await Shop.findOneAndUpdate(
      {
        _id: shop._id,
        mobileNumber: phone,
        owner: null,
      },
      {
        $set: { owner: owner._id },
      },
      { new: true }
    );

    if (!linkedShop) {
      // இணைப்பு தோல்வியடைந்தால் உருவாக்கிய கணக்கை நீக்குதல்
      await User.deleteOne({ _id: owner._id });
      createdOwnerId = null;

      return res.status(409).json({
        success: false,
        message:
          "இந்தக் கடை ஏற்கெனவே மற்றொரு Owner-உடன் இணைக்கப்பட்டுள்ளது.",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Owner கணக்கு உருவாக்கப்பட்டு கடையுடன் இணைக்கப்பட்டது.",
      user: publicUser(owner),
    });
  } catch (error) {
    console.error("Owner registration error:", error.message);

    // மற்றொரு request காரணமாக unique phone conflict ஏற்பட்டால்,
    // இன்னும் இணைக்கப்படாத account-ஐ சுத்தம் செய்தல்
    if (createdOwnerId) {
      try {
        const linked = await Shop.exists({ owner: createdOwnerId });

        if (!linked) {
          await User.deleteOne({ _id: createdOwnerId });
        }
      } catch (cleanupError) {
        console.error("Owner cleanup error:", cleanupError.message);
      }
    }

    return res.status(error.code === 11000 ? 409 : 500).json({
      success: false,
      message:
        error.code === 11000
          ? "இந்த மொபைல் எண்ணில் ஏற்கெனவே கணக்கு உள்ளது."
          : "Owner கணக்கை உருவாக்க முடியவில்லை.",
    });
  }
};


// LOGIN — CAPTCHA + phone number + password.
const loginUser = async (req, res) => {
  const phone = normalizePhone(req.body.phoneNumber);

  try {
    // 1. Validate CAPTCHA
    if (!validateCaptcha(req, res)) {
      await recordLogin(req, {
        phoneNumber: phone || "unknown",
        status: "failed",
        reason: "invalid-captcha",
      });

      return;
    }

    const { password } = req.body;

    // 2. Validate phone number and password
    if (
      !PHONE_REGEX.test(phone) ||
      typeof password !== "string" ||
      !password
    ) {
      await recordLogin(req, {
        phoneNumber: phone || "unknown",
        status: "failed",
        reason: "invalid-phone-or-password",
      });

      return res.status(400).json({
        success: false,
        message: "Valid phone number and password are required",
      });
    }

    // 3. Find user
    const user = await User.findOne({
      phoneNumber: phone,
    }).select("+password");

    if (!user || !user.isActive) {
      await recordLogin(req, {
        phoneNumber: phone,
        role: user?.role,
        userId: user?._id,
        status: "failed",
        reason: user ? "inactive-account" : "invalid-password",
      });

      return res.status(401).json({
        success: false,
        message: "Invalid phone number or password",
      });
    }

    // 4. Check whether login is locked
    const now = Date.now();

    if (
      user.loginLockedUntil &&
      user.loginLockedUntil.getTime() > now
    ) {
      const remainingSeconds = Math.ceil(
        (user.loginLockedUntil.getTime() - now) / 1000
      );

      await recordLogin(req, {
        phoneNumber: phone,
        role: user.role,
        userId: user._id,
        status: "failed",
        reason: "too-many-attempts",
      });

      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Try again in ${remainingSeconds} seconds.`,
        remainingSeconds,
      });
    }

    // 5. Clear expired lock
    if (
      user.loginLockedUntil &&
      user.loginLockedUntil.getTime() <= now
    ) {
      user.failedLoginAttempts = 0;
      user.loginLockedUntil = null;
    }

    // 6. Check password
    const isPasswordCorrect = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordCorrect) {
      user.failedLoginAttempts =
        (user.failedLoginAttempts || 0) + 1;

      // Lock account after 5 incorrect passwords
      if (user.failedLoginAttempts >= 5) {
        user.loginLockedUntil = new Date(Date.now() + 2 * 60 * 1000);
      }

      await user.save();

      await recordLogin(req, {
        phoneNumber: phone,
        role: user.role,
        userId: user._id,
        status: "failed",
        reason: "invalid-password",
      });

      if (user.loginLockedUntil) {
        return res.status(429).json({
          success: false,
          message:
            "Too many incorrect passwords. Login is blocked for 2 minutes.",
          remainingSeconds: 120,
        });
      }

      return res.status(401).json({
        success: false,
        message: "Invalid phone number or password",
        attemptsRemaining: 5 - user.failedLoginAttempts,
      });
    }

    // 7. Successful login: reset failed attempts
    user.failedLoginAttempts = 0;
    user.loginLockedUntil = null;
    await user.save();

    // 8. Create token
    const token = createToken(user);

    // 9. Record successful login
    await recordLogin(req, {
      phoneNumber: phone,
      role: user.role,
      userId: user._id,
      status: "success",
      reason: "success",
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not login",
    });
  }
};


// ADMIN-CREATED OWNER ACCOUNT
const createOwner = async (req, res) => {
  try {
    const { name, phoneNumber, password } = req.body;
    const phone = normalizePhone(phoneNumber);

    if (
      typeof name !== "string" ||
      !name.trim() ||
      !PHONE_REGEX.test(phone) ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 72
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid name, phone number and password are required",
      });
    }

    // Check existing user
    if (await User.exists({ phoneNumber: phone })) {
      return res.status(409).json({
        success: false,
        message: "This phone number is already registered",
      });
    }

    // Find unassigned shop using mobile number
    const shop = await Shop.findOne({
      mobileNumber: phone,
      owner: null,
    });

    if (!shop) {
      return res.status(404).json({
        success: false,
        message:
          "No unassigned shop found for this mobile number. Create the shop first or check the number.",
      });
    }

    // Create owner and link shop
    const owner = await User.create({
      name: name.trim(),
      phoneNumber: phone,
      password: await bcrypt.hash(password, 12),
      role: "owner",
      shop: shop._id,
    });

    // Assign shop to owner
    shop.owner = owner._id;
    await shop.save();

    return res.status(201).json({
      success: true,
      message: "Owner account created and shop linked successfully",
      user: publicUser(owner),
      shop,
    });
  } catch (error) {
    console.error("Owner creation error:", error.message);

    return res.status(error.code === 11000 ? 409 : 500).json({
      success: false,
      message:
        error.code === 11000
          ? "This phone number is already registered"
          : "Owner account creation failed",
    });
  }
};

// ADMIN-ONLY: List customer and owner accounts.
const getUsers = async (req, res) => {
  try {
    const users = await User.find({
      role: { $in: ["user", "owner"] },
    })
      .select("name phoneNumber role shop isActive createdAt")
      .populate("shop", "shopName")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("Get users error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch members",
    });
  }
};


// ADMIN-ONLY: Update member details
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phoneNumber, isActive } = req.body;

    // Validate member ID
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "தவறான உறுப்பினர் ID.",
      });
    }

    // Validate name
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "பெயரை உள்ளிடவும்.",
      });
    }

    // Validate mobile number
    if (
      typeof phoneNumber !== "string" ||
      !/^[6-9]\d{9}$/.test(phoneNumber)
    ) {
      return res.status(400).json({
        success: false,
        message: "சரியான 10 இலக்க மொபைல் எண்ணை உள்ளிடவும்.",
      });
    }

    // Validate account status
    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "கணக்கு நிலை சரியாக இல்லை.",
      });
    }

    // Find user or owner; admin accounts cannot be edited here
    const member = await User.findOne({
      _id: id,
      role: { $in: ["user", "owner"] },
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "உறுப்பினர் கிடைக்கவில்லை.",
      });
    }

    // Check whether another account uses this phone number
    const existingUser = await User.findOne({
      phoneNumber,
      _id: { $ne: id },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "இந்த மொபைல் எண் ஏற்கனவே பயன்படுத்தப்படுகிறது.",
      });
    }

    member.name = name.trim();
    member.phoneNumber = phoneNumber;
    member.isActive = isActive;

    await member.save();

    const updatedUser = await User.findById(member._id)
      .select("name phoneNumber role shop isActive createdAt")
      .populate("shop", "shopName");

    return res.status(200).json({
      success: true,
      message: "உறுப்பினர் விவரங்கள் வெற்றிகரமாக மாற்றப்பட்டன.",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update member error:", error.message);

    return res.status(500).json({
      success: false,
      message: "உறுப்பினர் விவரங்களை மாற்ற முடியவில்லை.",
    });
  }
};


// ADMIN-ONLY: Get login activity
const getLoginActivity = async (req, res) => {
  try {
    const activities = await LoginHistory.find()
      .populate("user", "name phoneNumber role")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const formattedActivities = activities.map((activity) => ({
      _id: activity._id,
      name: activity.user?.name || "தெரியவில்லை",
      phoneNumber: activity.phoneNumber,
      role: activity.role || activity.user?.role || "unknown",
      status: activity.status,
      reason: activity.reason,
      createdAt: activity.createdAt,
    }));

    return res.status(200).json({
      success: true,
      count: formattedActivities.length,
      activities: formattedActivities,
    });
  } catch (error) {
    console.error("Get login activity error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Login activity விவரங்களைப் பெற முடியவில்லை.",
    });
  }
};

module.exports = {
  registerUser,
  registerCustomer,
  registerOwner,
  loginUser,
  createOwner,
  getUsers,
  getLoginActivity,
  updateUser,
};
