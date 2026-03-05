const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { searchUsers } = require("../controllers/searchController");

const router = express.Router();

// Publicly available to all logged in users (auth middleware handles protecting the API mount point in server.js)
router.get("/search", asyncHandler(searchUsers));

module.exports = router;
