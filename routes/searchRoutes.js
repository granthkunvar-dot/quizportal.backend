const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { searchUsers } = require("../controllers/searchController");

const router = express.Router();

router.get("/search", asyncHandler(searchUsers));

module.exports = router;
