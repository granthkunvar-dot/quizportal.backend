const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const {
  createQuiz,
  addQuestion,
  publishQuiz,
  viewStudentResults
} = require("../controllers/instructorController");

const router = express.Router();

router.use(requireAuth, requireRole("instructor", "admin"));

router.post("/quizzes", asyncHandler(createQuiz));
router.post("/quizzes/:quizId/questions", asyncHandler(addQuestion));
router.patch("/quizzes/:quizId/publish", asyncHandler(publishQuiz));
router.get("/quizzes/:quizId/results", asyncHandler(viewStudentResults));

module.exports = router;
