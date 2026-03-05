const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/authMiddleware");
const { getGlobalLeaderboard, getCategoryLeaderboard } = require("../controllers/leaderboardController");

const router = express.Router();

// Require users to be authenticated to see the leaderboard
router.use(requireAuth);

router.get("/global", asyncHandler(getGlobalLeaderboard));
router.get("/category/:category", asyncHandler(getCategoryLeaderboard));

module.exports = router;
