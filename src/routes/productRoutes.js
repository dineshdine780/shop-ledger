const express = require("express");
const router = express.Router();

const {
  getOwnerProducts,
  getShopProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");

const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

// GET - Owner's products
router.get(
  "/owner",
  protect,
  authorizeRoles("owner"),
  getOwnerProducts
);

// GET - Products from a selected shop for users
router.get(
  "/shop/:shopId",
  protect,
  authorizeRoles("user"),
  getShopProducts
);

// POST - Add a product
router.post(
  "/",
  protect,
  authorizeRoles("owner"),
  createProduct
);

// PUT - Update a product
router.put(
  "/:id",
  protect,
  authorizeRoles("owner"),
  updateProduct
);

// DELETE - Delete a product
router.delete(
  "/:id",
  protect,
  authorizeRoles("owner"),
  deleteProduct
);

module.exports = router;