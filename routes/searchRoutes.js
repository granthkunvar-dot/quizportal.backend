const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { searchUsers, getPublicProfile } = require("../controllers/searchController");
const router = express.Router();

router.get("/search", asyncHandler(searchUsers));
router.get("/profile/:displayName", asyncHandler(getPublicProfile));

module.exports = router;
