USE quiz_portal;

-- 1. Create Initial Active Season (10 Days from now)
INSERT INTO seasons (start_date, end_date, is_active)
VALUES (NOW(), DATE_ADD(NOW(), INTERVAL 10 DAY), 1);
SET @season_id = LAST_INSERT_ID();

-- 2. Create the SE Technical Quiz
INSERT INTO quizzes (title, description, created_by, is_published)
VALUES ('Software Engineering Core Assessment', 'A rigorous technical assessment testing architecture, code review, debugging, and system design skills.', 2, 1);
SET @quiz_id = LAST_INSERT_ID();

-- ==========================================
-- Q1. ARCH_DECISION (Analyze)
-- ==========================================
INSERT INTO questions (quiz_id, question_text, question_type, points, order_index, category, difficulty, cognitive_level)
VALUES (@quiz_id, 'Which architectural pattern is most appropriate for a system with highly independent, scaling-differentiated components that communicate asynchronously?', 'ARCH_DECISION', 15.00, 1, 'Architecture', 'hard', 'analyze');
SET @q1_id = LAST_INSERT_ID();

INSERT INTO question_metadata (question_id, meta_key, meta_value)
VALUES 
(@q1_id, 'context_diagram', 'A system handling millions of user image uploads that must be asynchronously processed (resized, watermarked) without blocking the main web tier.'),
(@q1_id, 'constraints', 'High availability required. Occasional processing delays are acceptable, but lost uploads are not.');

INSERT INTO question_options (question_id, option_text, is_correct, order_index)
VALUES 
(@q1_id, 'Monolithic Architecture', 0, 1),
(@q1_id, 'Event-Driven Microservices', 1, 2),
(@q1_id, 'Layered (N-Tier) Architecture', 0, 3),
(@q1_id, 'Microkernel Architecture', 0, 4);

-- ==========================================
-- Q2. CODE_REVIEW (Evaluate)
-- ==========================================
INSERT INTO questions (quiz_id, question_text, question_type, points, order_index, category, difficulty, cognitive_level)
VALUES (@quiz_id, 'Identify the most critical security vulnerability in the following authentication middleware.', 'CODE_REVIEW', 20.00, 2, 'Security', 'hard', 'evaluate');
SET @q2_id = LAST_INSERT_ID();

INSERT INTO question_metadata (question_id, meta_key, meta_value)
VALUES 
(@q2_id, 'code_snippet', 'function authMiddleware(req, res, next) {\n  const token = req.headers.authorization;\n  if (!token) return res.status(401).send("No token");\n  \n  // verify token\n  const decoded = jwt.verify(token, process.env.SECRET);\n  \n  // Lookup user\n  db.query(`SELECT * FROM users WHERE id = ${decoded.id}`, (err, user) => {\n    if (err) return res.status(500).send("Error");\n    req.user = user;\n    next();\n  });\n}');

INSERT INTO question_options (question_id, option_text, is_correct, order_index)
VALUES 
(@q2_id, 'SQL Injection vulnerability due to string interpolation in the query', 1, 1),
(@q2_id, 'Cross-Site Scripting (XSS) in the 401 response', 0, 2),
(@q2_id, 'Missing CSRF token validation', 0, 3),
(@q2_id, 'Insecure Direct Object Reference (IDOR) on the user ID', 0, 4);

-- ==========================================
-- Q3. BUG_TRIAGE (Apply)
-- ==========================================
INSERT INTO questions (quiz_id, question_text, question_type, points, order_index, category, difficulty, cognitive_level)
VALUES (@quiz_id, 'Analyze the stack trace and bug report. What is the root cause of the crash in production?', 'BUG_TRIAGE', 10.00, 3, 'Debugging', 'medium', 'apply');
SET @q3_id = LAST_INSERT_ID();

INSERT INTO question_metadata (question_id, meta_key, meta_value)
VALUES 
(@q3_id, 'bug_report', 'Users are reporting that the "Download Report" button sometimes crashes the page with a white screen.'),
(@q3_id, 'stack_trace', 'TypeError: Cannot read properties of undefined (reading "map")\n    at ReportList.render (ReportList.jsx:45:21)\n    at ReactCompositeComponent...');

INSERT INTO question_options (question_id, option_text, is_correct, order_index)
VALUES 
(@q3_id, 'The API request is timing out before completion', 0, 1),
(@q3_id, 'The component is attempting to iterate over a data array that evaluates to undefined', 1, 2),
(@q3_id, 'A memory leak is causing the browser tab to crash', 0, 3),
(@q3_id, 'The backend is returning a 500 Internal Server Error', 0, 4);

-- ==========================================
-- Q4. CASE_STUDY (Evaluate)
-- ==========================================
INSERT INTO questions (quiz_id, question_text, question_type, points, order_index, category, difficulty, cognitive_level)
VALUES (@quiz_id, 'Based on the startup case study provided, which database scaling strategy should the team implement next?', 'CASE_STUDY', 15.00, 4, 'System Design', 'medium', 'evaluate');
SET @q4_id = LAST_INSERT_ID();

INSERT INTO question_metadata (question_id, meta_key, meta_value)
VALUES 
(@q4_id, 'case_text', 'EcoStart, a fast-growing platform, has hit extreme latency bottlenecks on their primary PostgreSQL database. Read operations currently account for 95% of all queries, heavily straining the CPU. They cannot afford downtime to migrate to a completely different database technology right now.');

INSERT INTO question_options (question_id, option_text, is_correct, order_index)
VALUES 
(@q4_id, 'Implement Read Replicas to offload read operations', 1, 1),
(@q4_id, 'Migrate entirely to a NoSQL database like MongoDB', 0, 2),
(@q4_id, 'Implement database sharding on the user_id key', 0, 3),
(@q4_id, 'Vertical scaling by adding more RAM to the master node', 0, 4);

-- ==========================================
-- Q5. MCQ_TEXT (Remember)
-- ==========================================
INSERT INTO questions (quiz_id, question_text, question_type, points, order_index, category, difficulty, cognitive_level)
VALUES (@quiz_id, 'What principle dictates that a class should have only one reason to change?', 'MCQ_TEXT', 5.00, 5, 'Design Patterns', 'easy', 'remember');
SET @q5_id = LAST_INSERT_ID();

INSERT INTO question_options (question_id, option_text, is_correct, order_index)
VALUES 
(@q5_id, 'Open-Closed Principle', 0, 1),
(@q5_id, 'Dependency Inversion Principle', 0, 2),
(@q5_id, 'Single Responsibility Principle', 1, 3),
(@q5_id, 'Liskov Substitution Principle', 0, 4);
