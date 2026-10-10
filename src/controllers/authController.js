const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// REGISTER USER
// REGISTER ADMIN
const registerUser = async (req, res) => {
  try {
    const { name, phoneNumber, password, role } = req.body;

    // Allow only admin registration in this setup endpoint
    if (role !== "admin") {
      return res.status(400).json({
        success: false,
        message: "Only admin registration is allowed",
      });
    }

    // Require a private setup key
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

    if (
      typeof name !== "string" ||
      typeof phoneNumber !== "string" ||
      typeof password !== "string" ||
      !name.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, phone number and password are required",
      });
    }

    const normalizedPhone = phoneNumber.trim();

    if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid 10-digit Indian phone number",
      });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        success: false,
        message: "Password must be 8 to 72 characters",
      });
    }

    const existingAdmin = await User.findOne({
      role: "admin",
    });

    if (existingAdmin) {
      return res.status(409).json({
        success: false,
        message: "An admin account already exists",
      });
    }

    const existingUser = await User.findOne({
      phoneNumber: normalizedPhone,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Phone number is already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const admin = await User.create({
      name: name.trim(),
      phoneNumber: normalizedPhone,
      password: hashedPassword,
      role: "admin",
    });

    return res.status(201).json({
      success: true,
      message: "Admin registered successfully",
      user: {
        id: admin._id,
        name: admin.name,
        phoneNumber: admin.phoneNumber,
        role: admin.role,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Phone number is already registered",
      });
    }

    console.error("Admin registration error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Admin registration failed",
    });
  }
};

// LOGIN USER
const loginUser = async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    if (
      typeof phoneNumber !== "string" ||
      typeof password !== "string" ||
      !phoneNumber.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Phone number and password are required",
      });
    }

    const normalizedPhone = phoneNumber.trim();

    if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid 10-digit Indian phone number",
      });
    }

    const user = await User.findOne({
      phoneNumber: normalizedPhone,
    }).select("+password");

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone number or password",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone number or password",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing from .env");

      return res.status(500).json({
        success: false,
        message: "Authentication service is not configured",
      });
    }

    const token = jwt.sign(
      {
        userId: user._id.toString(),
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
        issuer: "kadai-edu",
        audience: "kadai-edu-users",
      }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        phoneNumber: user.phoneNumber,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
};