const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const rateLimit = require("express-rate-limit");
const { register, login, logout, me } = require("../controllers/authController");
const { requireAuth, requireRole } = require("../middlewares/authMiddleware");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 active requests per windowMs
  message: { message: "Too many authentication attempts from this IP, please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/register", authLimiter, asyncHandler(register));
router.post("/login", authLimiter, asyncHandler(login));
router.post("/logout", asyncHandler(logout));
router.get("/me", asyncHandler(me));

router.get(
  "/admin-only",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    res.status(200).json({ message: "Admin access granted" });
  })
);

module.exports = router;
