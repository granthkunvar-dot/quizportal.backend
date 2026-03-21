const express = require("express");
// Fixed: Points to /middleware/asyncHandler.js
const asyncHandler = require("../middleware/asyncHandler");
const rateLimit = require("express-rate-limit");
const { register, login, logout, me } = require("../controllers/authController");
// Fixed: Points to /middleware/authMiddleware.js
const { requireAuth, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Too many authentication attempts, please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip
});

router.post("/register", authLimiter, asyncHandler(register));
router.post("/login", authLimiter, asyncHandler(login));
router.post("/logout", asyncHandler(logout));
router.get("/me", requireAuth, asyncHandler(me)); // Added requireAuth for security

module.exports = router;
