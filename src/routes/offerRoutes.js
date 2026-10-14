const express = require("express");
const router = express.Router();

const upload = require("../middleware/upload");

const {
  getAllOffers,
  getOwnerOffers,
  createOffer,
  updateOffer,
  deleteOffer,
} = require("../controllers/offerController");

const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");


router.get("/", getAllOffers);


router.get(
  "/owner",
  protect,
  authorizeRoles("owner"),
  getOwnerOffers
);



router.post(
  "/",
  protect,
  authorizeRoles("owner"),
  upload.single("image"),
  createOffer
);


router.put(
  "/:id",
  protect,
  authorizeRoles("owner"),
  upload.single("image"),
  updateOffer
);


router.delete(
  "/:id",
  protect,
  authorizeRoles("owner"),
  deleteOffer
);

module.exports = router;