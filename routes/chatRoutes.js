const express = require("express");
const router = express.Router();
const asyncHandler = require("../middleware/asyncHandler");
const { requireAuth } = require("../middleware/authMiddleware");
const { getChatHistory, sendMessage } = require("../controllers/chatHandler");

router.use(requireAuth);
router.get("/history", asyncHandler(getChatHistory));
router.post("/message", asyncHandler(sendMessage));

module.exports = router;
