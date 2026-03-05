const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireRole } = require("../middlewares/authMiddleware");
const { listAvailableQuizzes, getQuizDetails, startQuiz, submitQuiz } = require("../controllers/studentController");
const { getProfile, getLiveDashboardStats, updateProfile } = require("../controllers/profileController");
const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max physical limits
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only images are allowed"));
    }
  }
});

const router = express.Router();

router.use(requireAuth, requireRole("student", "admin"));

router.get("/quizzes", asyncHandler(listAvailableQuizzes));
router.get("/quiz/:quizId", asyncHandler(getQuizDetails));
router.post("/attempt/start/:quizId", asyncHandler(startQuiz));
router.post("/attempt/:attemptId/submit", asyncHandler(submitQuiz));
router.get("/profile", asyncHandler(getProfile));
router.put("/profile", upload.single("avatar"), asyncHandler(updateProfile));
router.get("/dashboard/live-stats", asyncHandler(getLiveDashboardStats));

module.exports = router;
