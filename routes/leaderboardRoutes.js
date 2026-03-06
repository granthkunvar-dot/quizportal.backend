const express = require("express");
// Fixed paths
const asyncHandler = require("../middleware/asyncHandler");
const { requireAuth } = require("../middleware/authMiddleware");
const { getGlobalLeaderboard, getCategoryLeaderboard } = require("../controllers/leaderboardController");

const router = express.Router();

router.use(requireAuth);

router.get("/global", asyncHandler(getGlobalLeaderboard));
router.get("/category/:category", asyncHandler(getCategoryLeaderboard));

module.exports = router;
