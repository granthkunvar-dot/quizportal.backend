const  pool  = require("../config/db");

/**
 * Validates and unlocks achievements for a student based on standard criteria
 */
const evaluateAchievements = async (studentId, connection) => {
    // We expect the calling function to provide the connection 
    // to keep it within the submission transaction if necessary
    const conn = connection || await pool.getConnection();

    try {
        const newlyUnlocked = [];

        // Fetch current unlocks
        const [existing] = await conn.execute(
            `SELECT achievement_key FROM achievements WHERE user_id = ?`,
            [studentId]
        );
        const unlockedKeys = new Set(existing.map(e => e.achievement_key));

        const unlock = async (key) => {
            if (!unlockedKeys.has(key)) {
                await conn.execute(
                    `INSERT IGNORE INTO achievements (user_id, achievement_key) VALUES (?, ?)`,
                    [studentId, key]
                );
                unlockedKeys.add(key);
                newlyUnlocked.push(key);
            }
        };

        // -------------------------------------------------------------
        // RULE 1: HARD_100 (Answer 100 Hard Questions Correctly)
        // -------------------------------------------------------------
        if (!unlockedKeys.has('HARD_100')) {
            const [hardStats] = await conn.execute(`
                SELECT COUNT(*) as count 
                FROM answers a
                JOIN attempts att ON a.attempt_id = att.attempt_id
                JOIN questions q ON a.question_id = q.question_id
                WHERE att.student_id = ? AND att.status = 'graded' AND q.difficulty = 'hard' AND a.is_correct = 1
            `, [studentId]);
            if (hardStats[0].count >= 100) {
                await unlock('HARD_100');
            }
        }

        // -------------------------------------------------------------
        // RULE 2: CONSISTENT_5_SEASONS (Participate in 5 Main Seasons)
        // -------------------------------------------------------------
        if (!unlockedKeys.has('CONSISTENT_5_SEASONS')) {
            const [seasonStats] = await conn.execute(`
                SELECT COUNT(*) as count 
                FROM user_season_results 
                WHERE user_id = ? AND participation_status = 'participated'
            `, [studentId]);
            if (seasonStats[0].count >= 5) {
                await unlock('CONSISTENT_5_SEASONS');
            }
        }

        // -------------------------------------------------------------
        // RULE 3: SIDE_WINNER_3 (Rank Top 3 in any Side Mode 3 times)
        // -------------------------------------------------------------
        if (!unlockedKeys.has('SIDE_WINNER_3')) {
            const [sideStats] = await conn.execute(`
                SELECT COUNT(*) as count 
                FROM user_side_season_results 
                WHERE user_id = ? AND final_rank <= 3
            `, [studentId]);
            if (sideStats[0].count >= 3) {
                await unlock('SIDE_WINNER_3');
            }
        }

        // -------------------------------------------------------------
        // RULE 4: TOP_1_PERCENT (Achieve Top 1% Lifetime Aura)
        // -------------------------------------------------------------
        if (!unlockedKeys.has('TOP_1_PERCENT')) {
            const [percentileRows] = await conn.execute(`
                SELECT 
                    (SELECT COUNT(*) FROM users WHERE role = 'student' AND status = 'active') as total,
                    (SELECT COUNT(*) FROM users WHERE role = 'student' AND status = 'active' AND lifetime_aura > u.lifetime_aura) as higher
                FROM users u WHERE u.user_id = ?
            `, [studentId]);

            if (percentileRows.length > 0) {
                const total = percentileRows[0].total;
                const higher = percentileRows[0].higher;
                if (total > 10) { // Require at least 10 users to constitute a meaningful 1%
                    const percent = (higher / total) * 100;
                    if (percent <= 1.0) {
                        await unlock('TOP_1_PERCENT');
                    }
                }
            }
        }

        // -------------------------------------------------------------
        // RULE 5: RANK_CLIMBER_20 (Climb 20 ranks in one day)
        // -------------------------------------------------------------
        if (!unlockedKeys.has('RANK_CLIMBER_20')) {
            // Check snapshot from today vs yesterday
            const todayStr = new Date().toISOString().split('T')[0];
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            const [rankDeltaPairs] = await conn.execute(`
                SELECT 
                   (SELECT rank_value FROM daily_rank_snapshots WHERE user_id = ? AND snapshot_date = ?) as rank_today,
                   (SELECT rank_value FROM daily_rank_snapshots WHERE user_id = ? AND snapshot_date = ?) as rank_yesterday
            `, [studentId, todayStr, studentId, yesterdayStr]);

            if (rankDeltaPairs.length > 0) {
                const rankT = rankDeltaPairs[0].rank_today;
                const rankY = rankDeltaPairs[0].rank_yesterday;
                if (rankT && rankY && (rankY - rankT >= 20)) {
                    await unlock('RANK_CLIMBER_20');
                }
            }
        }

        return newlyUnlocked;
    } catch (e) {
        console.error("Error evaluating achievements:", e);
        return [];
    } finally {
        if (!connection) {
            conn.release();
        }
    }
};

module.exports = {
    evaluateAchievements
};

