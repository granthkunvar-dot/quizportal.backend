const { pool } = require("../db");
const { quiz: quizConfig } = require("../config/env");
const { closeSeasonIfExpired, takeDailyRankSnapshot } = require("../services/seasonService");
const { evaluateAchievements } = require("../services/achievementService");

const parsePositiveInt = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const buildDeadline = (startedAt) => {
  const durationMs = quizConfig.timeLimitMinutes * 60 * 1000;
  return new Date(new Date(startedAt).getTime() + durationMs);
};

const toIso = (date) => new Date(date).toISOString();

const getDifficultyMultiplier = (diff) => {
  switch (diff) {
    case 'hard': return 2.0;
    case 'medium': return 1.5;
    case 'easy': default: return 1.0;
  }
};

const getCognitiveMultiplier = (cog) => {
  switch (cog) {
    case 'evaluate':
    case 'create': return 1.5;
    case 'apply':
    case 'analyze': return 1.25;
    case 'remember':
    case 'understand': default: return 1.0;
  }
};

const listAvailableQuizzes = async (req, res) => {
  const studentId = req.session.user.userId;

  const [rows] = await pool.execute(
    `SELECT
      q.quiz_id,
      q.title,
      q.description,
      q.category,
      q.created_by,
      u.full_name AS instructor_name,
      q.created_at,
      COUNT(ques.question_id) AS question_count
    FROM quizzes q
    INNER JOIN users u ON u.user_id = q.created_by
    LEFT JOIN questions ques ON ques.quiz_id = q.quiz_id
    WHERE q.is_published = 1
      AND NOT EXISTS (
        SELECT 1
        FROM attempts a
        WHERE a.quiz_id = q.quiz_id
          AND a.student_id = ?
          AND a.status IN ('submitted', 'graded')
      )
    GROUP BY q.quiz_id, q.title, q.description, q.category, q.created_by, u.full_name, q.created_at
    ORDER BY q.created_at DESC`,
    [studentId]
  );

  const quizzes = rows.map((quiz) => ({
    quizId: quiz.quiz_id,
    title: quiz.title,
    description: quiz.description,
    category: quiz.category,
    createdBy: quiz.created_by,
    instructorName: quiz.instructor_name,
    questionCount: Number(quiz.question_count),
    timeLimitMinutes: quizConfig.timeLimitMinutes,
    createdAt: quiz.created_at
  }));

  return res.status(200).json({ quizzes });
};

const getQuizDetails = async (req, res) => {
  const quizId = parsePositiveInt(req.params.quizId);
  if (!quizId) return res.status(400).json({ message: "Invalid quiz id" });

  const [rows] = await pool.execute(
    `SELECT q.quiz_id, q.title, q.description, u.full_name AS instructor_name, COUNT(ques.question_id) AS question_count
     FROM quizzes q
     INNER JOIN users u ON u.user_id = q.created_by
     LEFT JOIN questions ques ON ques.quiz_id = q.quiz_id
     WHERE q.quiz_id = ? AND q.is_published = 1
     GROUP BY q.quiz_id, q.title, q.description, u.full_name
     LIMIT 1`,
    [quizId]
  );

  if (rows.length === 0) return res.status(404).json({ message: "Quiz not found" });

  return res.status(200).json({
    quiz: {
      quizId: rows[0].quiz_id,
      title: rows[0].title,
      description: rows[0].description,
      instructorName: rows[0].instructor_name,
      questionCount: Number(rows[0].question_count),
      timeLimitMinutes: quizConfig.timeLimitMinutes
    }
  });
};

const startQuiz = async (req, res) => {
  const studentId = req.session.user.userId;
  const quizId = parsePositiveInt(req.params.quizId);

  if (req.session.user.role !== 'student') {
    return res.status(403).json({ message: "Only students may participate in quizzes." });
  }

  if (!quizId) {
    return res.status(400).json({ message: "Invalid quiz id" });
  }

  // System-level intercept: Check and close season if necessary before starting
  await closeSeasonIfExpired();

  const [quizRows] = await pool.execute(
    `SELECT q.quiz_id, q.title, q.description, q.created_by, q.is_published
     FROM quizzes q
     WHERE q.quiz_id = ? AND q.is_published = 1
     LIMIT 1`,
    [quizId]
  );

  if (quizRows.length === 0) {
    return res.status(404).json({ message: "Published quiz not found" });
  }

  const [existingAttemptRows] = await pool.execute(
    "SELECT attempt_id, started_at, status FROM attempts WHERE quiz_id = ? AND student_id = ? LIMIT 1",
    [quizId, studentId]
  );

  let attempt;
  if (existingAttemptRows.length > 0) {
    attempt = existingAttemptRows[0];
    if (attempt.status !== "in_progress") {
      return res.status(409).json({ message: "Reattempt is not allowed for this quiz" });
    }
  } else {
    const [questionCheck] = await pool.execute("SELECT 1 FROM questions WHERE quiz_id = ? LIMIT 1", [quizId]);
    if (questionCheck.length === 0) {
      return res.status(400).json({ message: "Quiz has no questions to attempt" });
    }

    try {
      const [attemptResult] = await pool.execute(
        "INSERT INTO attempts (quiz_id, student_id, status) VALUES (?, ?, 'in_progress')",
        [quizId, studentId]
      );
      const [newAttemptRows] = await pool.execute(
        "SELECT attempt_id, started_at, status FROM attempts WHERE attempt_id = ? LIMIT 1",
        [attemptResult.insertId]
      );
      attempt = newAttemptRows[0];
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        const [dupAttemptRows] = await pool.execute(
          "SELECT attempt_id, started_at, status FROM attempts WHERE quiz_id = ? AND student_id = ? LIMIT 1",
          [quizId, studentId]
        );
        attempt = dupAttemptRows[0];
        if (attempt.status !== "in_progress") {
          return res.status(409).json({ message: "Reattempt is not allowed for this quiz" });
        }
      } else {
        throw error;
      }
    }
  }

  const [questionRows] = await pool.execute(
    `SELECT question_id, question_text, question_type, points, order_index, category, difficulty, cognitive_level
     FROM questions
     WHERE quiz_id = ?
     ORDER BY order_index ASC`,
    [quizId]
  );

  let optionRows = [];
  let metadataRows = [];
  if (questionRows.length > 0) {
    const questionIds = questionRows.map((q) => q.question_id);
    const placeholders = questionIds.map(() => "?").join(",");

    const [oRows] = await pool.execute(
      `SELECT option_id, question_id, option_text, order_index
       FROM question_options
       WHERE question_id IN (${placeholders})
       ORDER BY question_id ASC, order_index ASC`,
      questionIds
    );
    optionRows = oRows;

    const [mRows] = await pool.execute(
      `SELECT metadata_id, question_id, meta_key, meta_value
       FROM question_metadata
       WHERE question_id IN (${placeholders})`,
      questionIds
    );
    metadataRows = mRows;
  }

  const deadline = buildDeadline(attempt.started_at);
  const remainingSeconds = Math.max(
    0,
    Math.floor((deadline.getTime() - Date.now()) / 1000)
  );

  const questionsWithOptions = questionRows.map((q) => {
    const options = optionRows
      .filter((o) => o.question_id === q.question_id)
      .map((o) => ({
        optionId: o.option_id,
        optionText: o.option_text,
        orderIndex: o.order_index
      }));

    const metadata = metadataRows
      .filter((m) => m.question_id === q.question_id)
      .reduce((acc, curr) => {
        acc[curr.meta_key] = curr.meta_value;
        return acc;
      }, {});

    return {
      questionId: q.question_id,
      questionText: q.question_text,
      questionType: q.question_type,
      points: Number(q.points),
      orderIndex: q.order_index,
      category: q.category,
      difficulty: q.difficulty,
      cognitiveLevel: q.cognitive_level,
      metadata,
      options
    };
  });

  return res.status(200).json({
    message: existingAttemptRows.length > 0 ? "Quiz resumed" : "Quiz started",
    attempt: {
      attemptId: attempt.attempt_id,
      status: attempt.status,
      startedAt: attempt.started_at,
      deadline: toIso(deadline),
      timeLimitMinutes: quizConfig.timeLimitMinutes,
      remainingSeconds
    },
    quiz: {
      quizId: quizRows[0].quiz_id,
      title: quizRows[0].title,
      description: quizRows[0].description
    },
    questions: questionsWithOptions
  });
};

const submitQuiz = async (req, res) => {
  const studentId = req.session.user.userId;
  const attemptId = parsePositiveInt(req.params.attemptId);
  const submittedAnswers = Array.isArray(req.body.answers) ? req.body.answers : [];

  if (req.session.user.role !== 'student') {
    return res.status(403).json({ message: "Only students may participate in quizzes." });
  }

  if (!attemptId) {
    return res.status(400).json({ message: "Invalid attempt id" });
  }

  // System-level intercept: Check and close season if necessary before submitting
  await closeSeasonIfExpired();
  await takeDailyRankSnapshot();

  const [attemptRows] = await pool.execute(
    `SELECT a.attempt_id, a.quiz_id, a.student_id, a.started_at, a.submitted_at, a.status, q.category
     FROM attempts a
     JOIN quizzes q ON a.quiz_id = q.quiz_id
     WHERE a.attempt_id = ? AND a.student_id = ?
     LIMIT 1`,
    [attemptId, studentId]
  );

  if (attemptRows.length === 0) {
    return res.status(404).json({ message: "Attempt not found" });
  }

  const attempt = attemptRows[0];
  if (attempt.status !== "in_progress") {
    return res.status(409).json({ message: "Attempt already submitted" });
  }

  const deadline = buildDeadline(attempt.started_at);
  const now = new Date();

  const GRACE_PERIOD_MS = 10000;
  if (now.getTime() > deadline.getTime() + GRACE_PERIOD_MS) {
    return res.status(403).json({ message: "Attempt time has expired" });
  }

  const timedOut = now.getTime() > deadline.getTime();

  const [questionRows] = await pool.execute(
    `SELECT question_id, question_text, question_type, points, category, difficulty, cognitive_level
     FROM questions
     WHERE quiz_id = ?
     ORDER BY order_index ASC`,
    [attempt.quiz_id]
  );

  if (questionRows.length === 0) {
    return res.status(400).json({ message: "Quiz has no questions" });
  }

  let optionRows = [];
  if (questionRows.length > 0) {
    const questionIds = questionRows.map((q) => q.question_id);
    const placeholders = questionIds.map(() => "?").join(",");
    const [oRows] = await pool.execute(
      `SELECT option_id, question_id, option_text, is_correct
       FROM question_options
       WHERE question_id IN (${placeholders})`,
      questionIds
    );
    optionRows = oRows;
  }

  const answerMap = new Map();
  for (const item of submittedAnswers) {
    const questionId = parsePositiveInt(item?.questionId);
    const optionId = parsePositiveInt(item?.optionId);
    if (!questionId) continue;
    answerMap.set(questionId, optionId);
  }

  let score = 0;
  let maxScore = 0;
  const evaluatedAnswers = [];

  for (const question of questionRows) {
    const submittedOptionId = answerMap.has(question.question_id) ? answerMap.get(question.question_id) : null;

    let isCorrect = false;
    let submittedOptionText = null;

    const optionsForQ = optionRows.filter(o => o.question_id === question.question_id);

    if (submittedOptionId) {
      const selectedOption = optionsForQ.find(o => o.option_id === submittedOptionId);
      if (selectedOption) {
        submittedOptionText = selectedOption.option_text;
        isCorrect = (selectedOption.is_correct === 1);
      }
    }

    const awardedPoints = isCorrect ? Number(question.points) : 0;
    maxScore += Number(question.points);
    score += awardedPoints;

    evaluatedAnswers.push({
      questionId: question.question_id,
      selectedOptionId: submittedOptionId,
      answerText: submittedOptionText,
      isCorrect,
      awardedPoints
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [updateResult] = await connection.execute(
      "UPDATE attempts SET submitted_at = ?, score = ?, status = 'graded' WHERE attempt_id = ? AND status = 'in_progress'",
      [now, score, attemptId]
    );

    if (updateResult.affectedRows === 0) {
      await connection.rollback();
      return res.status(409).json({ message: "Attempt already submitted concurrently" });
    }

    for (const answer of evaluatedAnswers) {
      await connection.execute(
        `INSERT INTO answers (attempt_id, question_id, selected_option_id, answer_text, is_correct, awarded_points)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           selected_option_id = VALUES(selected_option_id),
           answer_text = VALUES(answer_text),
           is_correct = VALUES(is_correct),
           awarded_points = VALUES(awarded_points),
           answered_at = CURRENT_TIMESTAMP`,
        [
          attemptId,
          answer.questionId,
          answer.selectedOptionId || null,
          answer.answerText || null,
          answer.isCorrect ? 1 : 0,
          answer.awardedPoints
        ]
      );
    }

    // --- LEADERBOARD & SEASONS TRANSACTIONAL LOGIC ---

    // 2. Lock and retrieve the active season safely
    const [seasonRows] = await connection.execute(
      `SELECT * FROM seasons WHERE is_active = 1 FOR UPDATE`
    );

    let activeSeason = seasonRows.length > 0 ? seasonRows[0] : null;

    if (!activeSeason) {
      // Fallback if somehow no season is active (Should not happen if service runs correctly)
      const now = new Date();
      const [insertSeason] = await connection.execute(
        `INSERT INTO seasons (start_date, end_date, is_active, is_closed) VALUES (?, DATE_ADD(?, INTERVAL 10 DAY), 1, 0)`,
        [now, now]
      );
      activeSeason = { season_id: insertSeason.insertId, start_date: now, end_date: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000) };
    }

    const isMainMode = (attempt.category === 'main');
    let diminishingFactor = 1.0;
    let rankBefore = null;
    let rankAfter = null;
    let auraGained = 0;
    let newAuraTotal = 0;
    let totalWeightedEarnedPoints = 0;
    let totalWeightedMaxPoints = 0;
    const categoryStats = {}; // { [category]: { earned, max } }

    if (isMainMode) {
      // 1a. MAIN MODE: Get previous graded attempts for this quiz
      const [prevAttemptsRows] = await connection.execute(
        `SELECT COUNT(*) as count FROM attempts 
         WHERE quiz_id = ? AND student_id = ? AND status = 'graded' AND attempt_id != ?`,
        [attempt.quiz_id, studentId, attemptId]
      );
      const prevAttemptsCount = Number(prevAttemptsRows[0].count);
      diminishingFactor = 1 / Math.sqrt(prevAttemptsCount + 1);

      // Pre-rank query (Main)
      const [preRankRows] = await connection.execute(
        `SELECT r.final_rank FROM (
           SELECT user_id, RANK() OVER (ORDER BY aura_points DESC, total_attempts ASC, stat_id ASC) as final_rank
           FROM leaderboard_stats WHERE season_id = ?
         ) r WHERE r.user_id = ?`,
        [activeSeason.season_id, studentId]
      );
      if (preRankRows.length > 0) rankBefore = Number(preRankRows[0].final_rank);

    } else {
      // 1b. SIDE MODE: Get today's attempts for this category
      const [todayAttemptsRows] = await connection.execute(
        `SELECT COUNT(*) as count FROM attempts a
         JOIN quizzes q ON a.quiz_id = q.quiz_id
         WHERE a.student_id = ? AND q.category = ? AND a.status = 'graded' 
           AND DATE(a.submitted_at) = CURRENT_DATE AND a.attempt_id != ?`,
        [studentId, attempt.category, attemptId]
      );
      const dailyCount = Number(todayAttemptsRows[0].count);
      diminishingFactor = Math.max(0.2, 1.0 - (dailyCount * 0.2));

      // Pre-rank query (Side)
      const [preRankRows] = await connection.execute(
        `SELECT r.final_rank FROM (
           SELECT user_id, RANK() OVER (ORDER BY side_aura_points DESC, total_attempts ASC, id ASC) as final_rank
           FROM side_leaderboard_stats WHERE season_id = ? AND category = ?
         ) r WHERE r.user_id = ?`,
        [activeSeason.season_id, attempt.category, studentId]
      );
      if (preRankRows.length > 0) rankBefore = Number(preRankRows[0].final_rank);
    }

    // 3. Aggregate Leaderboard Points
    for (const q of questionRows) {
      const ans = evaluatedAnswers.find(a => a.questionId === q.question_id);

      const diffMult = getDifficultyMultiplier(q.difficulty);
      const cogMult = getCognitiveMultiplier(q.cognitive_level);

      const baseEarned = (ans && ans.isCorrect) ? Number(q.points) : 0;
      const baseMax = Number(q.points);

      let weightedEarned = baseEarned * diffMult * cogMult;
      let weightedMax = baseMax * diffMult * cogMult;

      if (!isMainMode) {
        // Side Mode logic: Base * 0.6 * daily diminishing
        weightedEarned = weightedEarned * 0.6 * diminishingFactor;
        weightedMax = weightedMax * 0.6 * diminishingFactor;
      } else {
        // Main logic
        weightedEarned = weightedEarned * diminishingFactor;
        weightedMax = weightedMax * diminishingFactor;
      }

      totalWeightedEarnedPoints += weightedEarned;
      totalWeightedMaxPoints += weightedMax;

      const cat = q.category || 'Uncategorized';
      if (!categoryStats[cat]) categoryStats[cat] = { earned: 0, max: 0 };
      categoryStats[cat].earned += weightedEarned;
      categoryStats[cat].max += weightedMax;
    }

    auraGained = Number(totalWeightedEarnedPoints.toFixed(2));

    if (isMainMode) {
      // 4. Upsert Global Stats (Season Aura)
      await connection.execute(
        `INSERT INTO leaderboard_stats (user_id, season_id, aura_points, total_possible_weighted_points, total_attempts)
         VALUES (?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           aura_points = aura_points + VALUES(aura_points),
           total_possible_weighted_points = total_possible_weighted_points + VALUES(total_possible_weighted_points),
           total_attempts = total_attempts + 1`,
        [studentId, activeSeason.season_id, totalWeightedEarnedPoints, totalWeightedMaxPoints]
      );

      // 4.5 Update Lifetime Aura Atomically
      await connection.execute(
        `UPDATE users
         SET lifetime_aura = lifetime_aura + ?
         WHERE user_id = ?`,
        [totalWeightedEarnedPoints, studentId]
      );

      // 5. Upsert Category Stats
      for (const [cat, stats] of Object.entries(categoryStats)) {
        await connection.execute(
          `INSERT INTO leaderboard_category_stats (user_id, season_id, category, total_points, total_max_points)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             total_points = total_points + VALUES(total_points),
             total_max_points = total_max_points + VALUES(total_max_points)`,
          [studentId, activeSeason.season_id, cat, stats.earned, stats.max]
        );
      }

      // Post-rank query (Main)
      const [postRankRows] = await connection.execute(
        `SELECT r.final_rank, r.aura_points FROM (
           SELECT user_id, aura_points, RANK() OVER (ORDER BY aura_points DESC, total_attempts ASC, stat_id ASC) as final_rank
           FROM leaderboard_stats WHERE season_id = ?
         ) r WHERE r.user_id = ?`,
        [activeSeason.season_id, studentId]
      );
      if (postRankRows.length > 0) {
        rankAfter = Number(postRankRows[0].final_rank);
        newAuraTotal = Number(postRankRows[0].aura_points);
      }

    } else {
      // SIDE MODE UPSERT
      await connection.execute(
        `INSERT INTO side_leaderboard_stats (user_id, season_id, category, side_aura_points, total_attempts)
         VALUES (?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           side_aura_points = side_aura_points + VALUES(side_aura_points),
           total_attempts = total_attempts + 1`,
        [studentId, activeSeason.season_id, attempt.category, totalWeightedEarnedPoints]
      );

      // Post-rank query (Side)
      const [postRankRows] = await connection.execute(
        `SELECT r.final_rank, r.side_aura_points FROM (
           SELECT user_id, side_aura_points, RANK() OVER (ORDER BY side_aura_points DESC, total_attempts ASC, id ASC) as final_rank
           FROM side_leaderboard_stats WHERE season_id = ? AND category = ?
         ) r WHERE r.user_id = ?`,
        [activeSeason.season_id, attempt.category, studentId]
      );
      if (postRankRows.length > 0) {
        rankAfter = Number(postRankRows[0].final_rank);
        newAuraTotal = Number(postRankRows[0].side_aura_points);
      }
    }

    // --- STREAK EVALUATION ---
    const todayStr = now.toISOString().split('T')[0];
    const [userStreakRows] = await connection.execute(
      `SELECT current_streak, last_activity_date FROM users WHERE user_id = ?`,
      [studentId]
    );

    if (userStreakRows.length > 0) {
      const u = userStreakRows[0];
      const lastActivityStr = u.last_activity_date ? new Date(u.last_activity_date).toISOString().split('T')[0] : null;

      let newStreak = u.current_streak;

      if (lastActivityStr !== todayStr) { // If playing for the first time today
        if (lastActivityStr) {
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];

          if (lastActivityStr === yesterdayStr) {
            newStreak += 1; // Played yesterday, increment streak
          } else {
            newStreak = 1; // Broke streak, reset to 1
          }
        } else {
          newStreak = 1; // First time ever
        }

        await connection.execute(
          `UPDATE users SET current_streak = ?, last_activity_date = ? WHERE user_id = ?`,
          [newStreak, todayStr, studentId]
        );
      }
    }

    // --- ACHIEVEMENTS EVALUATION ---
    const unlockedAchievements = await evaluateAchievements(studentId, connection);

    req.submissionResultPayload = isMainMode ? {
      mode: 'main',
      auraGained,
      newSeasonAura: newAuraTotal,
      rankBefore,
      rankAfter,
      unlockedAchievements
    } : {
      mode: 'side',
      category: attempt.category,
      auraGained,
      efficiencyPercent: Math.round(diminishingFactor * 100),
      newSideAura: newAuraTotal,
      rankBefore,
      rankAfter,
      unlockedAchievements
    };

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return res.status(200).json({
    message: "Quiz submitted successfully",
    attempt: {
      attemptId,
      quizId: attempt.quiz_id,
      timedOut,
      startedAt: attempt.started_at,
      deadline: toIso(deadline),
      submittedAt: now.toISOString(),
      score,
      maxScore
    },
    answers: evaluatedAnswers,
    resultPayload: req.submissionResultPayload
  });
};

module.exports = {
  listAvailableQuizzes,
  getQuizDetails,
  startQuiz,
  submitQuiz
};
