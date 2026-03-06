const { pool } = require("../db");
const { parseQuizText } = require("../services/quizParserService");

// Helper to log admin actions
const logAdminAction = async (adminId, actionType, entityType, entityId, beforeState, afterState, connection = pool) => {
  await connection.execute(
    `INSERT INTO admin_logs (admin_id, action_type, entity_type, entity_id, before_state, after_state)
         VALUES (?, ?, ?, ?, ?, ?)`,
    [
      adminId,
      actionType,
      entityType,
      entityId || null,
      beforeState ? JSON.stringify(beforeState) : null,
      afterState ? JSON.stringify(afterState) : null
    ]
  );
};

// ------------------------------------------------------------------
// USERS
// ------------------------------------------------------------------
exports.getUsers = async (req, res) => {
  try {
    const [users] = await pool.execute(
      `SELECT u.user_id, u.full_name, u.display_name, u.email, u.role, u.status, u.lifetime_aura, 
                    u.current_streak, u.last_activity_date, u.created_at, u.is_verified,
                    (
                        SELECT r.final_rank 
                        FROM (
                            SELECT user_id, RANK() OVER (ORDER BY aura_points DESC, total_attempts ASC, stat_id ASC) as final_rank
                            FROM leaderboard_stats
                            WHERE season_id = (SELECT season_id FROM seasons WHERE is_active = 1 LIMIT 1)
                        ) r WHERE r.user_id = u.user_id
                    ) as current_rank
             FROM users u
             ORDER BY u.created_at DESC`
    );
    res.json({ users });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.suspendUser = async (req, res) => {
  const adminId = req.user.userId;
  const targetUserId = req.params.id;

  try {
    const [userDb] = await pool.execute("SELECT status, role FROM users WHERE user_id = ?", [targetUserId]);
    if (userDb.length === 0) return res.status(404).json({ message: "User not found" });

    if (userDb[0].role === 'super_admin') return res.status(403).json({ message: "Cannot suspend super admin" });

    await pool.execute("UPDATE users SET status = 'suspended' WHERE user_id = ?", [targetUserId]);

    await logAdminAction(adminId, 'SUSPEND', 'user', targetUserId, { status: userDb[0].status }, { status: 'suspended' });
    res.json({ message: "User suspended" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.reinstateUser = async (req, res) => {
  const adminId = req.user.userId;
  const targetUserId = req.params.id;

  try {
    const [userDb] = await pool.execute("SELECT status FROM users WHERE user_id = ?", [targetUserId]);
    if (userDb.length === 0) return res.status(404).json({ message: "User not found" });

    await pool.execute("UPDATE users SET status = 'active' WHERE user_id = ?", [targetUserId]);

    await logAdminAction(adminId, 'REINSTATE', 'user', targetUserId, { status: userDb[0].status }, { status: 'active' });
    res.json({ message: "User reinstated" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.resetUserStreak = async (req, res) => {
  const adminId = req.user.userId;
  const targetUserId = req.params.id;

  try {
    const [userDb] = await pool.execute("SELECT current_streak FROM users WHERE user_id = ?", [targetUserId]);
    if (userDb.length === 0) return res.status(404).json({ message: "User not found" });

    await pool.execute("UPDATE users SET current_streak = 0, last_activity_date = NULL WHERE user_id = ?", [targetUserId]);

    await logAdminAction(adminId, 'RESET_STREAK', 'user', targetUserId, { current_streak: userDb[0].current_streak }, { current_streak: 0 });
    res.json({ message: "User streak reset" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.toggleVerification = async (req, res) => {
  const adminId = req.user.userId;
  const targetUserId = req.params.id;

  try {
    const [userDb] = await pool.execute("SELECT is_verified, full_name FROM users WHERE user_id = ?", [targetUserId]);
    if (userDb.length === 0) return res.status(404).json({ message: "User not found" });

    const currentStatus = userDb[0].is_verified;
    const newStatus = currentStatus ? 0 : 1;

    await pool.execute("UPDATE users SET is_verified = ? WHERE user_id = ?", [newStatus, targetUserId]);

    await logAdminAction(adminId, 'TOGGLE_VERIFICATION', 'user', targetUserId, { is_verified: currentStatus }, { is_verified: newStatus });
    res.json({ message: newStatus ? "User verified" : "User verification revoked" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ------------------------------------------------------------------
// QUIZZES
// ------------------------------------------------------------------
exports.getQuizzes = async (req, res) => {
  try {
    const [quizzes] = await pool.execute(
      `SELECT q.quiz_id, q.title, q.description, q.category, q.is_published, q.created_at,
                    u.full_name as created_by_name,
                    COUNT(ques.question_id) as question_count
             FROM quizzes q
             JOIN users u ON u.user_id = q.created_by
             LEFT JOIN questions ques ON ques.quiz_id = q.quiz_id
             GROUP BY q.quiz_id
             ORDER BY q.created_at DESC`
    );
    res.json({ quizzes });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.createQuiz = async (req, res) => {
  const adminId = req.user.userId;
  const { title, description, category, is_published } = req.body;

  try {
    const [result] = await pool.execute(
      `INSERT INTO quizzes (title, description, category, is_published, created_by) VALUES (?, ?, ?, ?, ?)`,
      [title, description || '', category || 'main', is_published ? 1 : 0, adminId]
    );
    const newQuizId = result.insertId;

    await logAdminAction(adminId, 'CREATE', 'quiz', newQuizId, null, { title, category, is_published });
    res.status(201).json({ message: "Quiz created", quizId: newQuizId });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.bulkParseQuiz = async (req, res) => {
  const { rawText, expectedCount } = req.body;

  if (!rawText) return res.status(400).json({ message: "rawText is required" });

  try {
    const count = expectedCount ? parseInt(expectedCount) : 15;
    const parsedData = parseQuizText(rawText, count);
    res.json({ parsedData });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.bulkPublishQuiz = async (req, res) => {
  const adminId = req.user.userId;
  const { title, category, rawText, expectedCount } = req.body;

  if (!title || !category || !rawText) {
    return res.status(400).json({ message: "Title, category, and rawText are required." });
  }

  const count = expectedCount ? parseInt(expectedCount) : 15;
  let parsedData;
  try {
    // Re-verify payload deterministically server-side. Do not trust frontend JSON.
    parsedData = parseQuizText(rawText, count);
  } catch (e) {
    return res.status(400).json({ message: `Validation Failed during publish: ${e.message}` });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Insert the Quiz
    const [quizRes] = await connection.execute(
      `INSERT INTO quizzes (title, description, category, is_published, created_by) VALUES (?, ?, ?, 1, ?)`,
      [title, 'Bulk imported quiz.', category, adminId]
    );
    const quizId = quizRes.insertId;

    // 2. Insert Questions and Options
    for (const q of parsedData) {
      const [qRes] = await connection.execute(
        `INSERT INTO questions (quiz_id, question_text, question_type, difficulty, cognitive_level, points, order_index)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [quizId, q.question_text, q.question_type, q.difficulty, q.cognitive_level, q.points, parsedData.indexOf(q) + 1]
      );
      const questionId = qRes.insertId;

      for (const opt of q.options) {
        await connection.execute(
          `INSERT INTO THIS_TABLE_DOES_NOT_EXIST (question_id, option_text, is_correct, order_index) VALUES (?, ?, ?, ?)`,
          [questionId, opt.text, opt.is_correct ? 1 : 0, opt.order_index]
        );
      }
    }

    // 3. Log Full Audit Snapshot
    const fullSnapshot = {
      title,
      category,
      expectedCount: count,
      rawParsedStructure: parsedData
    };
    await logAdminAction(adminId, 'BULK_PUBLISH', 'quiz', quizId, null, fullSnapshot, connection);

    await connection.commit();
    res.status(201).json({ message: "Quiz successfully parsed, structured, and published.", quizId });

  } catch (e) {
    await connection.rollback();
    res.status(500).json({ message: "Database transaction failed: " + e.message });
  } finally {
    connection.release();
  }
};

exports.updateQuiz = async (req, res) => {
  const adminId = req.user.userId;
  const quizId = req.params.id;
  const { title, description, category } = req.body;

  try {
    const [old] = await pool.execute("SELECT title, description, category FROM quizzes WHERE quiz_id = ?", [quizId]);
    if (old.length === 0) return res.status(404).json({ message: "Quiz not found" });

    await pool.execute(
      `UPDATE quizzes SET title = ?, description = ?, category = ? WHERE quiz_id = ?`,
      [title, description || '', category || 'main', quizId]
    );

    await logAdminAction(adminId, 'UPDATE', 'quiz', quizId, old[0], { title, description, category });
    res.json({ message: "Quiz updated" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.updateQuizStatus = async (req, res) => {
  const adminId = req.user.userId;
  const quizId = req.params.id;
  const { is_published } = req.body;

  try {
    const [old] = await pool.execute("SELECT is_published FROM quizzes WHERE quiz_id = ?", [quizId]);
    if (old.length === 0) return res.status(404).json({ message: "Quiz not found" });

    const pubVal = is_published ? 1 : 0;
    await pool.execute("UPDATE quizzes SET is_published = ? WHERE quiz_id = ?", [pubVal, quizId]);

    await logAdminAction(adminId, 'UPDATE_STATUS', 'quiz', quizId, { is_published: old[0].is_published }, { is_published: pubVal });
    res.json({ message: "Quiz status updated" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.deleteQuiz = async (req, res) => {
  const adminId = req.user.userId;
  const quizId = req.params.id;

  try {
    const [old] = await pool.execute("SELECT title FROM quizzes WHERE quiz_id = ?", [quizId]);
    if (old.length === 0) return res.status(404).json({ message: "Quiz not found" });

    await pool.execute("DELETE FROM quizzes WHERE quiz_id = ?", [quizId]);

    await logAdminAction(adminId, 'DELETE', 'quiz', quizId, old[0], null);
    res.json({ message: "Quiz deleted" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ------------------------------------------------------------------
// QUESTIONS
// ------------------------------------------------------------------
exports.getQuestions = async (req, res) => {
  try {
    const [questions] = await pool.execute(
      `SELECT q.question_id, q.quiz_id, q.question_text, q.difficulty, q.cognitive_level, q.points, quiz.title as quiz_title
             FROM questions q
             JOIN quizzes quiz ON q.quiz_id = quiz.quiz_id
             ORDER BY q.created_at DESC
             LIMIT 100` // Limit for basic interface
    );
    res.json({ questions });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.createQuestion = async (req, res) => {
  const adminId = req.user.userId;
  const { quiz_id, question_text, difficulty, cognitive_level, points, order_index } = req.body;

  try {
    const [result] = await pool.execute(
      `INSERT INTO questions (quiz_id, question_text, difficulty, cognitive_level, points, order_index)
             VALUES (?, ?, ?, ?, ?, ?)`,
      [quiz_id, question_text, difficulty || 'medium', cognitive_level || 'understand', points || 1, order_index || 1]
    );
    const newId = result.insertId;

    await logAdminAction(adminId, 'CREATE', 'question', newId, null, { quiz_id, difficulty, cognitive_level });
    res.status(201).json({ message: "Question created", questionId: newId });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.updateQuestion = async (req, res) => {
  const adminId = req.user.userId;
  const qId = req.params.id;
  const { question_text, difficulty, cognitive_level, points } = req.body;

  try {
    const [old] = await pool.execute("SELECT question_text, difficulty, cognitive_level FROM questions WHERE question_id = ?", [qId]);

    await pool.execute(
      `UPDATE questions SET question_text=?, difficulty=?, cognitive_level=?, points=? WHERE question_id=?`,
      [question_text, difficulty, cognitive_level, points, qId]
    );

    await logAdminAction(adminId, 'UPDATE', 'question', qId, old[0], { difficulty, cognitive_level });
    res.json({ message: "Question updated" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.deleteQuestion = async (req, res) => {
  const adminId = req.user.userId;
  const qId = req.params.id;

  try {
    await pool.execute("DELETE FROM questions WHERE question_id = ?", [qId]);
    await logAdminAction(adminId, 'DELETE', 'question', qId, null, null);
    res.json({ message: "Question deleted" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ------------------------------------------------------------------
// SEASONS
// ------------------------------------------------------------------
exports.getSeasons = async (req, res) => {
  try {
    const [seasons] = await pool.execute(
      `SELECT * FROM seasons ORDER BY end_date DESC`
    );
    res.json({ seasons });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.extendSeason = async (req, res) => {
  const adminId = req.user.userId;
  const seasonId = req.params.id;
  const { addDays } = req.body;

  try {
    const [old] = await pool.execute("SELECT end_date FROM seasons WHERE season_id = ?", [seasonId]);

    await pool.execute(
      `UPDATE seasons SET end_date = DATE_ADD(end_date, INTERVAL ? DAY) WHERE season_id = ?`,
      [addDays || 1, seasonId]
    );

    await logAdminAction(adminId, 'EXTEND', 'season', seasonId, { end_date: old[0].end_date }, { added_days: addDays });
    res.json({ message: `Season extended by ${addDays} days` });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.forceCloseSeason = async (req, res) => {
  const adminId = req.user.userId;
  // We can pull in the closeSeason logic from seasonService.js, bypassing time checks.
  const { closeSeasonIfExpired } = require("../services/seasonService");

  const conn = await pool.getConnection();
  try {
    // Find active season
    const [active] = await conn.execute("SELECT season_id FROM seasons WHERE is_active = 1 LIMIT 1");
    if (active.length === 0) return res.status(400).json({ message: "No active season to close" });
    const sId = active[0].season_id;

    // Force expiration to now so the service closes it immediately
    await conn.execute("UPDATE seasons SET end_date = CURRENT_TIMESTAMP WHERE is_active = 1");

    // Release connection so the service can use the pool normally
    conn.release();

    await closeSeasonIfExpired();

    await logAdminAction(adminId, 'FORCE_CLOSE', 'season', sId, { is_active: 1 }, { is_active: 0 });

    res.json({ message: "Season force closed and rolled over." });
  } catch (e) {
    if (conn) conn.release();
    res.status(500).json({ message: e.message });
  }
};

// ------------------------------------------------------------------
// ANALYTICS & LOGS
// ------------------------------------------------------------------
exports.getAnalyticsOverview = async (req, res) => {
  try {
    const [users] = await pool.execute(`SELECT COUNT(*) as count FROM users WHERE role = 'student' AND status = 'active'`);
    const [suspended] = await pool.execute(`SELECT COUNT(*) as count FROM users WHERE status = 'suspended'`);
    const [activeSeason] = await pool.execute(`SELECT season_id FROM seasons WHERE is_active = 1 LIMIT 1`);

    let partMain = 0;
    let partSide = 0;

    if (activeSeason.length > 0) {
      const sId = activeSeason[0].season_id;
      const [mainParts] = await pool.execute(`SELECT COUNT(*) as count FROM leaderboard_stats WHERE season_id = ?`, [sId]);
      const [sideParts] = await pool.execute(`SELECT COUNT(DISTINCT user_id) as count FROM side_leaderboard_stats WHERE season_id = ?`, [sId]);
      partMain = mainParts[0].count;
      partSide = sideParts[0].count;
    }

    const [hardAcc] = await pool.execute(`
            SELECT 
                COUNT(CASE WHEN is_correct = 1 THEN 1 END) as correct,
                COUNT(*) as total
            FROM answers a
            JOIN questions q ON a.question_id = q.question_id
            WHERE q.difficulty = 'hard'
        `);

    let hardAccuracy = 0;
    if (hardAcc[0].total > 0) {
      hardAccuracy = (hardAcc[0].correct / hardAcc[0].total) * 100;
    }

    res.json({
      overview: {
        totalActiveStudents: users[0].count,
        suspendedUsers: suspended[0].count,
        activeSeasonId: activeSeason.length > 0 ? activeSeason[0].season_id : null,
        mainParticipants: partMain,
        sideParticipants: partSide,
        hardQuestionAccuracy: Math.round(hardAccuracy)
      }
    });

  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const [logs] = await pool.execute(
      `SELECT l.*, u.full_name as admin_name 
             FROM admin_logs l 
             JOIN users u ON l.admin_id = u.user_id 
             ORDER BY l.created_at DESC 
             LIMIT 100`
    );
    res.json({ logs });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ------------------------------------------------------------------
// SUPER ADMIN ROLE MGMT
// ------------------------------------------------------------------
exports.updateUserRole = async (req, res) => {
  const adminId = req.user.userId;
  const targetUserId = req.params.id;
  const { role } = req.body; // 'student', 'instructor', 'admin', 'super_admin'

  const validRoles = ['student', 'instructor', 'admin', 'super_admin'];
  if (!validRoles.includes(role)) return res.status(400).json({ message: "Invalid role" });

  try {
    const [old] = await pool.execute("SELECT role FROM users WHERE user_id = ?", [targetUserId]);
    if (old.length === 0) return res.status(404).json({ message: "User not found" });

    // Prevent deleting last super_admin
    if (old[0].role === 'super_admin' && role !== 'super_admin') {
      const [saCount] = await pool.execute("SELECT COUNT(*) as count FROM users WHERE role = 'super_admin'");
      if (saCount[0].count <= 1) {
        return res.status(400).json({ message: "Cannot demote the last super_admin" });
      }
    }

    await pool.execute("UPDATE users SET role = ? WHERE user_id = ?", [role, targetUserId]);

    await logAdminAction(adminId, 'CHANGE_ROLE', 'user', targetUserId, { role: old[0].role }, { role });
    res.json({ message: `Role updated to ${role}` });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
