const { pool } = require("../db");

const TITLES = [
    "Aura Farmer",    // Rank 1
    "IQ Monster",     // Rank 2
    "RizzGod",        // Rank 3
    "The Warlord",    // Rank 4
    "System Slayer"   // Rank 5
];

const assignTitle = (rank) => {
    if (rank >= 1 && rank <= 5) {
        return TITLES[rank - 1];
    }
    return null;
};

/**
 * System-level function to cleanly close an expired season.
 * Evaluates rankings deterministically, assigns top 5 titles,
 * and records history for all students.
 */
const closeSeasonIfExpired = async () => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Lock active season to prevent race conditions
        const [seasonRows] = await connection.execute(
            `SELECT * FROM seasons WHERE is_active = 1 FOR UPDATE`
        );

        if (seasonRows.length === 0) {
            // No active season to process
            await connection.commit();
            return;
        }

        const activeSeason = seasonRows[0];
        const now = new Date();
        const seasonEnd = new Date(activeSeason.end_date);

        // If season hasn't ended or is already closed, do nothing.
        if (now.getTime() <= seasonEnd.getTime() || activeSeason.is_closed === 1) {
            await connection.commit();
            return;
        }

        // --- SEASON IS EXPIRED AND NEEDS CLOSING ---

        // 2. Fetch all students (total_participants base value)
        const [allStudents] = await connection.execute(
            `SELECT user_id FROM users WHERE role = 'student'`
        );
        const totalParticipants = allStudents.length;

        // 3. Mark the current season as closed and INACTIVE
        await connection.execute(
            `UPDATE seasons SET is_active = NULL, is_closed = 1 WHERE season_id = ?`,
            [activeSeason.season_id]
        );

        // 4. Calculate exact, deterministic ranks for this season using window functions
        //    Tie break: Higher aura -> Fewer total attempts -> Lower stat_id (stable fallback)
        const [rankings] = await connection.execute(
            `SELECT 
         user_id, 
         aura_points,
         RANK() OVER (ORDER BY aura_points DESC, total_attempts ASC, stat_id ASC) as final_rank
       FROM leaderboard_stats
       WHERE season_id = ?`,
            [activeSeason.season_id]
        );

        // Create a lookup map for participants
        const participantMap = new Map();
        for (const r of rankings) {
            participantMap.set(r.user_id, {
                rank: Number(r.final_rank),
                aura: Number(r.aura_points)
            });
        }

        // 5. Insert historical records for EVERY student
        for (const student of allStudents) {
            const pData = participantMap.get(student.user_id);

            let finalRank = null;
            let seasonAura = 0.00;
            let status = 'absent';
            let awardedTitle = null;

            if (pData) {
                finalRank = pData.rank;
                seasonAura = pData.aura;
                status = 'participated';
                awardedTitle = assignTitle(finalRank);
            }

            await connection.execute(
                `INSERT INTO user_season_results 
          (user_id, season_id, final_rank, total_participants, season_aura, participation_status, awarded_title)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    student.user_id,
                    activeSeason.season_id,
                    finalRank,
                    totalParticipants,
                    seasonAura,
                    status,
                    awardedTitle
                ]
            );
        }

        // 5.5 Process Side Modes
        const SIDE_CATEGORIES = [
            { id: 'automotive', titles: ['Gearhead Champion', 'Torque Elite', 'Track Specialist'] },
            { id: 'cinema', titles: ['Screen Sovereign', 'Plot Strategist', 'Scene Specialist'] },
            { id: 'gk', titles: ['Knowledge Emperor', 'Trivia Tactician', 'Info Specialist'] }
        ];

        for (const cat of SIDE_CATEGORIES) {
            const [sideRankings] = await connection.execute(
                `SELECT 
                   user_id, 
                   RANK() OVER (ORDER BY side_aura_points DESC, total_attempts ASC, id ASC) as final_rank
                 FROM side_leaderboard_stats
                 WHERE season_id = ? AND category = ?`,
                [activeSeason.season_id, cat.id]
            );

            const sideParticipantMap = new Map();
            for (const r of sideRankings) {
                sideParticipantMap.set(r.user_id, Number(r.final_rank));
            }

            for (const student of allStudents) {
                const finalRank = sideParticipantMap.get(student.user_id) || null;
                const status = finalRank ? 'participated' : 'absent';
                let awardedTitle = null;
                if (finalRank && finalRank <= 3) {
                    awardedTitle = cat.titles[finalRank - 1];
                }

                await connection.execute(
                    `INSERT INTO user_side_season_results 
                     (user_id, season_id, category, final_rank, total_participants, awarded_title, participation_status)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        student.user_id,
                        activeSeason.season_id,
                        cat.id,
                        finalRank,
                        totalParticipants,
                        awardedTitle,
                        status
                    ]
                );
            }
        }

        // 6. Automatically start the next season
        await connection.execute(
            `INSERT INTO seasons (start_date, end_date, is_active, is_closed) 
       VALUES (?, DATE_ADD(?, INTERVAL 10 DAY), 1, 0)`,
            [now, now]
        );

        await connection.commit();
        console.log(`[SeasonService] Successfully closed season ${activeSeason.season_id} and opened new season.`);

    } catch (error) {
        await connection.rollback();
        console.error(`[SeasonService] Failed to close season:`, error);
    } finally {
        connection.release();
    }
};

/**
 * System-level function to snapshot ranks daily.
 * Must be called intermittently (e.g. from the same place as closeSeasonIfExpired)
 */
const takeDailyRankSnapshot = async () => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Check active season
        const [seasonRows] = await connection.execute(
            `SELECT season_id, last_snapshot_date FROM seasons WHERE is_active = 1 FOR UPDATE`
        );
        if (seasonRows.length === 0) {
            await connection.commit();
            return;
        }

        const activeSeason = seasonRows[0];
        const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        // Check if snapshot already taken today
        const lastSnapshotStr = activeSeason.last_snapshot_date
            ? new Date(activeSeason.last_snapshot_date).toISOString().split('T')[0]
            : null;

        if (lastSnapshotStr === todayStr) {
            // Already taken today
            await connection.commit();
            return;
        }

        // Fetch top 100 users strictly for daily_rank_snapshots
        const [rankings] = await connection.execute(
            `SELECT 
                user_id,
                RANK() OVER (ORDER BY aura_points DESC, total_attempts ASC, stat_id ASC) as final_rank
             FROM leaderboard_stats
             WHERE season_id = ?
             LIMIT 100`, // Store Top 100 max for efficiency
            [activeSeason.season_id]
        );

        if (rankings.length > 0) {
            const values = [];
            const placeholders = [];

            for (const r of rankings) {
                placeholders.push('(?, ?, ?, ?)');
                values.push(r.user_id, activeSeason.season_id, todayStr, Number(r.final_rank));
            }

            // Bulk Insert
            await connection.execute(
                `INSERT INTO daily_rank_snapshots (user_id, season_id, snapshot_date, rank_value)
                 VALUES ${placeholders.join(',')}
                 ON DUPLICATE KEY UPDATE rank_value = VALUES(rank_value)`,
                values
            );
        }

        await connection.execute(
            `UPDATE seasons SET last_snapshot_date = ? WHERE season_id = ?`,
            [todayStr, activeSeason.season_id]
        );

        await connection.commit();
        console.log(`[SeasonService] Took daily snapshot for season ${activeSeason.season_id}.`);
    } catch (error) {
        await connection.rollback();
        console.error(`[SeasonService] Failed to take daily rank snapshot:`, error);
    } finally {
        connection.release();
    }
};

module.exports = {
    closeSeasonIfExpired,
    takeDailyRankSnapshot
};

