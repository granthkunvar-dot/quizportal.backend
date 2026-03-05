const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');
const { requireAdmin, requireSuperAdmin } = require("../middlewares/adminAuth");
const adminController = require("../controllers/adminController");

router.use(requireAuth);
router.use(requireAdmin);

const asyncHandler = require("../utils/asyncHandler");

// Analytics
router.get("/analytics/overview", asyncHandler(adminController.getAnalyticsOverview));

// Quizzes
router.get("/quizzes", asyncHandler(adminController.getQuizzes));
router.post("/quizzes", asyncHandler(adminController.createQuiz));
router.post("/quizzes/bulk-parse", asyncHandler(adminController.bulkParseQuiz));
router.post("/quizzes/bulk-publish", asyncHandler(adminController.bulkPublishQuiz));
router.put("/quizzes/:id", asyncHandler(adminController.updateQuiz));
router.patch("/quizzes/:id/status", asyncHandler(adminController.updateQuizStatus));
router.delete("/quizzes/:id", asyncHandler(adminController.deleteQuiz));

// Questions
router.get("/questions", asyncHandler(adminController.getQuestions));
router.post("/questions", asyncHandler(adminController.createQuestion));
router.put("/questions/:id", asyncHandler(adminController.updateQuestion));
router.delete("/questions/:id", asyncHandler(adminController.deleteQuestion));

// Users
router.get("/users", asyncHandler(adminController.getUsers));
router.patch("/users/:id/suspend", asyncHandler(adminController.suspendUser));
router.patch("/users/:id/reinstate", asyncHandler(adminController.reinstateUser));
router.patch("/users/:id/reset-streak", asyncHandler(adminController.resetUserStreak));
router.patch("/users/:id/toggle-verification", asyncHandler(adminController.toggleVerification));

// Seasons
router.get("/seasons", asyncHandler(adminController.getSeasons));
router.patch("/seasons/:id/extend", requireSuperAdmin, asyncHandler(adminController.extendSeason));
router.post("/seasons/force-close", requireSuperAdmin, asyncHandler(adminController.forceCloseSeason));

// SuperAdmin Only
router.patch("/users/:id/role", requireSuperAdmin, asyncHandler(adminController.updateUserRole));

// Audit Logs
router.get("/audit-logs", asyncHandler(adminController.getAuditLogs));

module.exports = router;
