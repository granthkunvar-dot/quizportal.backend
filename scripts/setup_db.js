const { pool } = require("./src/config/db");

async function setup() {
    const connection = await pool.getConnection();
    try {
        await connection.execute(`ALTER TABLE users ADD COLUMN lifetime_aura DECIMAL(12,2) DEFAULT 0.00`).catch(() => console.log('lifetime_aura exists'));
        await connection.execute(`ALTER TABLE users ADD COLUMN profile_picture_url VARCHAR(255) NULL`).catch(() => console.log('profile_picture_url exists'));
        await connection.execute(`
            ALTER TABLE users 
            ADD COLUMN display_name VARCHAR(50) NOT NULL UNIQUE
        `).catch(() => console.log('display_name exists'));
        await connection.execute(`ALTER TABLE users ADD COLUMN reputation_score INT DEFAULT 0`).catch(() => console.log('reputation_score exists'));
        await connection.execute(`ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT FALSE`).catch(() => console.log('is_verified exists'));
        await connection.execute(`ALTER TABLE users ADD COLUMN specialization VARCHAR(100) NULL`).catch(() => console.log('specialization exists'));
        await connection.execute(`ALTER TABLE users ADD COLUMN current_core_title VARCHAR(100) NULL`).catch(() => console.log('current_core_title exists'));
        await connection.execute(`ALTER TABLE users ADD COLUMN current_streak INT DEFAULT 0`).catch(() => console.log('current_streak exists'));
        await connection.execute(`ALTER TABLE users ADD COLUMN last_activity_date DATE NULL`).catch(() => console.log('last_activity_date exists'));
        await connection.execute(`ALTER TABLE users ADD COLUMN status ENUM('active','suspended') DEFAULT 'active'`).catch(() => console.log('status exists'));
        await connection.execute(`ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'instructor', 'student', 'super_admin') NOT NULL DEFAULT 'student'`).catch((e) => console.log('role modify exists:', e.message));

        await connection.execute(`ALTER TABLE leaderboard_stats RENAME COLUMN total_weighted_points TO aura_points`).catch(() => console.log('aura_points exists'));
        await connection.execute(`ALTER TABLE seasons ADD COLUMN is_closed TINYINT(1) DEFAULT 0`).catch(() => console.log('is_closed exists'));
        await connection.execute(`ALTER TABLE seasons ADD COLUMN last_snapshot_date DATE NULL`).catch(() => console.log('last_snapshot_date exists'));
        await connection.execute(`ALTER TABLE quizzes ADD COLUMN category ENUM('main', 'automotive', 'cinema', 'gk') NOT NULL DEFAULT 'main'`).catch(() => console.log('category exists'));

        await connection.execute(`
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
    `);

        await connection.execute(`
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
    `);

        await connection.execute(`
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
    `);

        await connection.execute(`
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
    `);

        await connection.execute(`
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
    `);

        await connection.execute(`
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
    `);

        await connection.execute(`
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
    `);

        // Promote super_admin
        await connection.execute(`UPDATE users SET role = 'super_admin' WHERE email = 'granth@test.com'`).catch(console.error);

        // Update Foreign Key Constraints from CASCADE to RESTRICT
        await connection.execute(`ALTER TABLE attempts DROP FOREIGN KEY fk_attempts_quiz`).catch((e) => console.log('fk_attempts_quiz drop failed: ', e.message));
        await connection.execute(`
            ALTER TABLE attempts
            ADD CONSTRAINT fk_attempts_quiz
            FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id)
            ON UPDATE CASCADE
            ON DELETE RESTRICT
        `).catch((e) => console.log('fk_attempts_quiz add failed: ', e.message));

        // Add BTree Read Indexes
        await connection.execute(`CREATE INDEX idx_attempts_student ON attempts(student_id)`).catch(() => console.log('idx_attempts_student exists'));
        await connection.execute(`CREATE INDEX idx_answers_attempt ON answers(attempt_id)`).catch(() => console.log('idx_answers_attempt exists'));
        await connection.execute(`CREATE INDEX idx_questions_quiz ON questions(quiz_id)`).catch(() => console.log('idx_questions_quiz exists'));

        console.log("DB Schema Updated Successfully");
    } catch (e) {
        console.error(e);
    } finally {
        connection.release();
        process.exit(0);
    }
}
setup();
