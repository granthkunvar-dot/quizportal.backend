-- MySQL schema for quiz application
-- Includes tables: users, quizzes, questions, attempts, answers

-- DROP TABLE IF EXISTS leaderboard_category_stats;
-- DROP TABLE IF EXISTS leaderboard_stats;
-- DROP TABLE IF EXISTS seasons;
-- DROP TABLE IF EXISTS answers;
-- DROP TABLE IF EXISTS attempts;
-- DROP TABLE IF EXISTS question_options;
-- DROP TABLE IF EXISTS question_metadata;
-- DROP TABLE IF EXISTS questions;
-- DROP TABLE IF EXISTS quizzes;
-- DROP TABLE IF EXISTS follows;
-- DROP TABLE IF EXISTS chat_messages;
-- DROP TABLE IF EXISTS admin_logs;
-- DROP TABLE IF EXISTS daily_rank_snapshots;
-- DROP TABLE IF EXISTS achievements;
-- DROP TABLE IF EXISTS user_side_season_results;
-- DROP TABLE IF EXISTS user_season_results;
-- DROP TABLE IF EXISTS side_leaderboard_stats;
-- DROP TABLE IF EXISTS users;

CREATE TABLE IF NOT EXISTS users (
    user_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'instructor', 'student', 'super_admin') NOT NULL DEFAULT 'student',
    status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
    lifetime_aura DECIMAL(12,2) DEFAULT 0.00,
    current_streak INT DEFAULT 0,
    last_activity_date DATE NULL,
    profile_picture_url VARCHAR(255) NULL,
    display_name VARCHAR(50) NOT NULL UNIQUE,
    reputation_score INT DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    specialization VARCHAR(100) NULL,
    current_core_title VARCHAR(100) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_users_full_name_nonempty CHECK (CHAR_LENGTH(TRIM(full_name)) > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quizzes (
    quiz_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NULL,
    category ENUM('main', 'automotive', 'cinema', 'gk') NOT NULL DEFAULT 'main',
    created_by BIGINT UNSIGNED NOT NULL,
    is_published TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_quizzes_created_by
        FOREIGN KEY (created_by) REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT chk_quizzes_title_nonempty CHECK (CHAR_LENGTH(TRIM(title)) > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS questions (
    question_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    quiz_id BIGINT UNSIGNED NOT NULL,
    question_text TEXT NOT NULL,
    question_type ENUM('single_choice', 'multiple_choice', 'short_answer', 'true_false', 'MCQ_TEXT', 'CASE_STUDY', 'CODE_REVIEW', 'ARCH_DECISION', 'BUG_TRIAGE') NOT NULL DEFAULT 'single_choice',
    points DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    order_index INT UNSIGNED NOT NULL,
    category VARCHAR(100) NULL,
    difficulty ENUM('easy', 'medium', 'hard') NOT NULL DEFAULT 'medium',
    cognitive_level ENUM('remember', 'understand', 'apply', 'analyze', 'evaluate', 'create') NOT NULL DEFAULT 'understand',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_questions_quiz
        FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT uq_questions_quiz_order UNIQUE (quiz_id, order_index),
    CONSTRAINT chk_questions_text_nonempty CHECK (CHAR_LENGTH(TRIM(question_text)) > 0),
    CONSTRAINT chk_questions_points_positive CHECK (points > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS question_metadata (
    metadata_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    question_id BIGINT UNSIGNED NOT NULL,
    meta_key VARCHAR(100) NOT NULL,
    meta_value TEXT NOT NULL,
    CONSTRAINT fk_metadata_question
        FOREIGN KEY (question_id) REFERENCES questions(question_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS question_options (
    option_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    question_id BIGINT UNSIGNED NOT NULL,
    option_text TEXT NOT NULL,
    is_correct TINYINT(1) NOT NULL DEFAULT 0,
    order_index INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_options_question
        FOREIGN KEY (question_id) REFERENCES questions(question_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT chk_options_text_nonempty CHECK (CHAR_LENGTH(TRIM(option_text)) > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attempts (
    attempt_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    quiz_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at DATETIME NULL,
    score DECIMAL(6,2) NULL,
    status ENUM('in_progress', 'submitted', 'graded') NOT NULL DEFAULT 'in_progress',
    CONSTRAINT fk_attempts_quiz
        FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_attempts_student
        FOREIGN KEY (student_id) REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT uq_attempts_quiz_student UNIQUE (quiz_id, student_id),
    CONSTRAINT chk_attempts_score_nonnegative CHECK (score IS NULL OR score >= 0),
    CONSTRAINT chk_attempts_submit_time CHECK (submitted_at IS NULL OR submitted_at >= started_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS answers (
    answer_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    attempt_id BIGINT UNSIGNED NOT NULL,
    question_id BIGINT UNSIGNED NOT NULL,
    selected_option_id BIGINT UNSIGNED NULL,
    answer_text TEXT NULL,
    is_correct TINYINT(1) NULL,
    awarded_points DECIMAL(5,2) NULL,
    answered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_answers_attempt
        FOREIGN KEY (attempt_id) REFERENCES attempts(attempt_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_answers_question
        FOREIGN KEY (question_id) REFERENCES questions(question_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_answers_option
        FOREIGN KEY (selected_option_id) REFERENCES question_options(option_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    CONSTRAINT uq_answers_attempt_question UNIQUE (attempt_id, question_id),
    CONSTRAINT chk_answers_awarded_points_nonnegative CHECK (awarded_points IS NULL OR awarded_points >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS seasons (
    season_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    start_date DATETIME NOT NULL,
    end_date DATETIME NOT NULL,
    is_active TINYINT(1) DEFAULT NULL,
    is_closed TINYINT(1) DEFAULT 0,
    last_snapshot_date DATE NULL,
    CONSTRAINT uq_active_season UNIQUE (is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS leaderboard_stats (
    stat_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    season_id BIGINT UNSIGNED NOT NULL,
    aura_points DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_possible_weighted_points DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_attempts INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_leaderboard_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_leaderboard_season
        FOREIGN KEY (season_id) REFERENCES seasons(season_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT uq_stats_user_season UNIQUE (user_id, season_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS leaderboard_category_stats (
    cat_stat_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    season_id BIGINT UNSIGNED NOT NULL,
    category VARCHAR(100) NOT NULL,
    total_points DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_max_points DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    CONSTRAINT fk_cat_stats_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_cat_stats_season
        FOREIGN KEY (season_id) REFERENCES seasons(season_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT uq_cat_stats UNIQUE (user_id, season_id, category)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_season_results (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    season_id BIGINT UNSIGNED NOT NULL,
    final_rank INT NULL,
    total_participants INT NOT NULL,
    season_aura DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    participation_status ENUM('participated', 'absent') NOT NULL,
    awarded_title VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_season_result_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_user_season_result_season
        FOREIGN KEY (season_id) REFERENCES seasons(season_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS side_leaderboard_stats (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    season_id BIGINT UNSIGNED NOT NULL,
    category ENUM('automotive', 'cinema', 'gk') NOT NULL,
    side_aura_points DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_attempts INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_side_leaderboard_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_side_leaderboard_season
        FOREIGN KEY (season_id) REFERENCES seasons(season_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT uq_side_stats_user_season_cat UNIQUE (user_id, season_id, category)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_side_season_results (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    season_id BIGINT UNSIGNED NOT NULL,
    category ENUM('automotive', 'cinema', 'gk') NOT NULL,
    final_rank INT NULL,
    total_participants INT NOT NULL,
    awarded_title VARCHAR(50) NULL,
    participation_status ENUM('participated', 'absent') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_side_season_result_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_user_side_season_result_season
        FOREIGN KEY (season_id) REFERENCES seasons(season_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS achievements (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    achievement_key VARCHAR(100) NOT NULL,
    unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_achievements_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT uq_user_achievement UNIQUE (user_id, achievement_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS daily_rank_snapshots (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    season_id BIGINT UNSIGNED NOT NULL,
    snapshot_date DATE NOT NULL,
    rank_value INT NOT NULL,
    CONSTRAINT fk_snapshot_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_snapshot_season
        FOREIGN KEY (season_id) REFERENCES seasons(season_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT uq_user_season_date UNIQUE (user_id, season_id, snapshot_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    admin_id BIGINT UNSIGNED NOT NULL,
    action_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id BIGINT NULL,
    before_state TEXT NULL,
    after_state TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_admin_log_admin
        FOREIGN KEY (admin_id) REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS follows (
    follower_id BIGINT UNSIGNED NOT NULL,
    following_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id),
    CONSTRAINT fk_follows_follower
        FOREIGN KEY (follower_id) REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_follows_following
        FOREIGN KEY (following_id) REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    message TEXT NOT NULL,
    room VARCHAR(50) NOT NULL DEFAULT 'worldwide',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_chat_messages_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    INDEX idx_room_created_at (room, created_at)
) ENGINE=InnoDB;

INSERT INTO users (full_name, email, password_hash, display_name, role)
VALUES
    ('System Admin', 'admin@example.com', '$2b$10$q9gsoR41HH7ozE5tCluk/DeprogJZ28FN0Sg3GHUAm7HC05u6yDd2o', 'System Admin', 'super_admin'),
    ('Course Instructor', 'instructor@example.com', '$2b$10$q9gsoR41HH7ozE5tCluk/DeprogJZ28FN0Sg3GHUAm7HC05u6yDd2o', 'Instructor One', 'instructor'),
    ('Test Student', 'student@example.com', '$2b$10$q9gsoR41HH7ozE5tCluk/DeprogJZ28FN0Sg3GHUAm7HC05u6yDd2o', 'Test Student', 'student');

CREATE INDEX idx_attempts_student ON attempts(student_id);
CREATE INDEX idx_answers_attempt ON answers(attempt_id);
CREATE INDEX idx_questions_quiz ON questions(quiz_id);
