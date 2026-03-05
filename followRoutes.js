const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/authMiddleware");
const { followUser, unfollowUser, getFollowers, getFollowing, getPublicProfile } = require("../controllers/followController");

const router = express.Router();

router.get("/profile/:displayName", asyncHandler(getPublicProfile));
router.post("/:id/follow", requireAuth, asyncHandler(followUser));
router.post("/:id/unfollow", requireAuth, asyncHandler(unfollowUser));
router.get("/:id/followers", asyncHandler(getFollowers));
router.get("/:id/following", asyncHandler(getFollowing));

module.exports = router;
