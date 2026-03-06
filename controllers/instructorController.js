const { pool } = require("../db");

const ALLOWED_QUESTION_TYPES = new Set([
  "single_choice",
  "multiple_choice",
  "short_answer",
  "true_false"
]);

const parsePositiveInt = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const getAccessibleQuiz = async (quizId, sessionUser) => {
  if (sessionUser.role === "admin") {
    const [rows] = await pool.execute(
      "SELECT quiz_id, title, created_by, is_published FROM quizzes WHERE quiz_id = ? LIMIT 1",
      [quizId]
    );
    return rows[0] || null;
  }

  const [rows] = await pool.execute(
    "SELECT quiz_id, title, created_by, is_published FROM quizzes WHERE quiz_id = ? AND created_by = ? LIMIT 1",
    [quizId, sessionUser.userId]
  );
  return rows[0] || null;
};

const createQuiz = async (req, res) => {
  const title = String(req.body.title || "").trim();
  const description = req.body.description == null ? null : String(req.body.description).trim();

  if (!title) {
    return res.status(400).json({ message: "Quiz title is required" });
  }

  const [result] = await pool.execute(
    "INSERT INTO quizzes (title, description, created_by, is_published) VALUES (?, ?, ?, ?)",
    [title, description || null, req.session.user.userId, 0]
  );

  return res.status(201).json({
    message: "Quiz created successfully",
    quiz: {
      quizId: result.insertId,
      title,
      description: description || null,
      createdBy: req.session.user.userId,
      isPublished: false
    }
  });
};

const addQuestion = async (req, res) => {
  const quizId = parsePositiveInt(req.params.quizId);
  const questionText = String(req.body.questionText || "").trim();
  const questionType = String(req.body.questionType || "single_choice").trim().toLowerCase();
  const points = req.body.points == null ? 1 : Number(req.body.points);
  const orderIndex =
    req.body.orderIndex == null ? null : parsePositiveInt(req.body.orderIndex);
  const correctAnswer = req.body.correctAnswer == null ? null : String(req.body.correctAnswer).trim();

  if (!quizId) {
    return res.status(400).json({ message: "Invalid quiz id" });
  }

  if (!questionText) {
    return res.status(400).json({ message: "Question text is required" });
  }

  if (!ALLOWED_QUESTION_TYPES.has(questionType)) {
    return res.status(400).json({ message: "Invalid question type" });
  }

  if (!Number.isFinite(points) || points <= 0) {
    return res.status(400).json({ message: "Points must be a positive number" });
  }

  const quiz = await getAccessibleQuiz(quizId, req.session.user);
  if (!quiz) {
    return res.status(404).json({ message: "Quiz not found or not accessible" });
  }

  if (quiz.is_published) {
    return res.status(400).json({ message: "Cannot add questions to a published quiz" });
  }

  let finalOrderIndex = orderIndex;
  if (!finalOrderIndex) {
    const [nextRows] = await pool.execute(
      "SELECT COALESCE(MAX(order_index), 0) + 1 AS next_order FROM questions WHERE quiz_id = ?",
      [quizId]
    );
    finalOrderIndex = nextRows[0].next_order;
  }

  try {
    const [result] = await pool.execute(
      "INSERT INTO questions (quiz_id, question_text, question_type, points, order_index, correct_answer) VALUES (?, ?, ?, ?, ?, ?)",
      [quizId, questionText, questionType, points, finalOrderIndex, correctAnswer || null]
    );

    return res.status(201).json({
      message: "Question added successfully",
      question: {
        questionId: result.insertId,
        quizId,
        questionText,
        questionType,
        points,
        orderIndex: finalOrderIndex,
        correctAnswer: correctAnswer || null
      }
    });
  } catch (error) {
    if (error && error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "orderIndex already exists for this quiz" });
    }
    throw error;
  }
};

const publishQuiz = async (req, res) => {
  const quizId = parsePositiveInt(req.params.quizId);
  if (!quizId) {
    return res.status(400).json({ message: "Invalid quiz id" });
  }

  const quiz = await getAccessibleQuiz(quizId, req.session.user);
  if (!quiz) {
    return res.status(404).json({ message: "Quiz not found or not accessible" });
  }

  const [questionCountRows] = await pool.execute(
    "SELECT COUNT(*) AS total_questions FROM questions WHERE quiz_id = ?",
    [quizId]
  );

  if (questionCountRows[0].total_questions < 1) {
    return res.status(400).json({ message: "Cannot publish quiz without questions" });
  }

  await pool.execute("UPDATE quizzes SET is_published = 1 WHERE quiz_id = ?", [quizId]);

  return res.status(200).json({
    message: "Quiz published successfully",
    quiz: {
      quizId,
      isPublished: true
    }
  });
};

const viewStudentResults = async (req, res) => {
  const quizId = parsePositiveInt(req.params.quizId);
  if (!quizId) {
    return res.status(400).json({ message: "Invalid quiz id" });
  }

  const quiz = await getAccessibleQuiz(quizId, req.session.user);
  if (!quiz) {
    return res.status(404).json({ message: "Quiz not found or not accessible" });
  }

  const [attemptRows] = await pool.execute(
    `SELECT
      a.attempt_id,
      a.student_id,
      u.full_name AS student_name,
      u.email AS student_email,
      a.status,
      a.score,
      a.started_at,
      a.submitted_at
    FROM attempts a
    INNER JOIN users u ON u.user_id = a.student_id
    WHERE a.quiz_id = ?
    ORDER BY a.started_at DESC`,
    [quizId]
  );

  if (attemptRows.length === 0) {
    return res.status(200).json({
      quiz: {
        quizId: quiz.quiz_id,
        title: quiz.title
      },
      attempts: []
    });
  }

  const attemptIds = attemptRows.map((row) => row.attempt_id);
  const placeholders = attemptIds.map(() => "?").join(", ");

  const [answerRows] = await pool.execute(
    `SELECT
      ans.attempt_id,
      ans.answer_id,
      ans.question_id,
      q.question_text,
      ans.answer_text,
      ans.is_correct,
      ans.awarded_points,
      ans.answered_at
    FROM answers ans
    INNER JOIN questions q ON q.question_id = ans.question_id
    WHERE ans.attempt_id IN (${placeholders})
    ORDER BY ans.attempt_id, ans.question_id`,
    attemptIds
  );

  const answersByAttempt = new Map();
  for (const answer of answerRows) {
    if (!answersByAttempt.has(answer.attempt_id)) {
      answersByAttempt.set(answer.attempt_id, []);
    }
    answersByAttempt.get(answer.attempt_id).push({
      answerId: answer.answer_id,
      questionId: answer.question_id,
      questionText: answer.question_text,
      answerText: answer.answer_text,
      isCorrect: answer.is_correct,
      awardedPoints: answer.awarded_points,
      answeredAt: answer.answered_at
    });
  }

  const attempts = attemptRows.map((attempt) => ({
    attemptId: attempt.attempt_id,
    student: {
      userId: attempt.student_id,
      fullName: attempt.student_name,
      email: attempt.student_email
    },
    status: attempt.status,
    score: attempt.score,
    startedAt: attempt.started_at,
    submittedAt: attempt.submitted_at,
    answers: answersByAttempt.get(attempt.attempt_id) || []
  }));

  return res.status(200).json({
    quiz: {
      quizId: quiz.quiz_id,
      title: quiz.title
    },
    attempts
  });
};

module.exports = {
  createQuiz,
  addQuestion,
  publishQuiz,
  viewStudentResults
};
