const pool = require("../config/db");

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

const closeSeasonIfExpired = async () => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [seasonRows] = await connection.execute(
            `SELECT * FROM seasons WHERE is_active = 1 FOR UPDATE`
        );

        if (seasonRows.length === 0) {
            await connection.commit();
            return;
        }

        const activeSeason = seasonRows[0];
        const now = new Date();
        const seasonEnd = new Date(activeSeason.end_date);

        if (now.getTime() <= seasonEnd.getTime() || activeSeason.is_closed === 1) {
            await connection.commit();
            return;
        }

        const [allStudents] = await connection.execute(
            `SELECT user_id FROM users WHERE role = 'student'`
        );
        const totalParticipants = allStudents.length;

        await connection.execute(
            `UPDATE seasons SET is_active = NULL, is_closed = 1 WHERE season_id = ?`,
            [activeSeason.season_id]
        );

        // MySQL 5.7 compatible ranking — fetch all stats and rank in JS
        const [leaderboardRows] = await connection.execute(
            `SELECT user_id, aura_points, total_attempts, stat_id
             FROM leaderboard_stats
             WHERE season_id = ?`,
            [activeSeason.season_id]
        );

        // Sort deterministically: higher aura DESC, fewer attempts ASC, lower stat_id ASC
        leaderboardRows.sort((a, b) => {
            if (Number(b.aura_points) !== Number(a.aura_points)) return Number(b.aura_points) - Number(a.aura_points);
            if (Number(a.total_attempts) !== Number(b.total_attempts)) return Number(a.total_attempts) - Number(b.total_attempts);
            return Number(a.stat_id) - Number(b.stat_id);
        });

        const participantMap = new Map();
        let rank = 1;
        for (let i = 0; i < leaderboardRows.length; i++) {
            const r = leaderboardRows[i];
            // Handle ties
            if (i > 0) {
                const prev = leaderboardRows[i - 1];
                if (Number(r.aura_points) !== Number(prev.aura_points) ||
                    Number(r.total_attempts) !== Number(prev.total_attempts)) {
                    rank = i + 1;
                }
            }
            participantMap.set(r.user_id, {
                rank,
                aura: Number(r.aura_points)
            });
        }

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
                [student.user_id, activeSeason.season_id, finalRank, totalParticipants, seasonAura, status, awardedTitle]
            );
        }

        // Process Side Modes
        const SIDE_CATEGORIES = [
            { id: 'automotive', titles: ['Gearhead Champion', 'Torque Elite', 'Track Specialist'] },
            { id: 'cinema', titles: ['Screen Sovereign', 'Plot Strategist', 'Scene Specialist'] },
            { id: 'gk', titles: ['Knowledge Emperor', 'Trivia Tactician', 'Info Specialist'] }
        ];

        for (const cat of SIDE_CATEGORIES) {
            const [sideRows] = await connection.execute(
                `SELECT user_id, side_aura_points, total_attempts, id
                 FROM side_leaderboard_stats
                 WHERE season_id = ? AND category = ?`,
                [activeSeason.season_id, cat.id]
            );

            // Sort deterministically in JS
            sideRows.sort((a, b) => {
                if (Number(b.side_aura_points) !== Number(a.side_aura_points)) return Number(b.side_aura_points) - Number(a.side_aura_points);
                if (Number(a.total_attempts) !== Number(b.total_attempts)) return Number(a.total_attempts) - Number(b.total_attempts);
                return Number(a.id) - Number(b.id);
            });

            const sideParticipantMap = new Map();
            let sideRank = 1;
            for (let i = 0; i < sideRows.length; i++) {
                const r = sideRows[i];
                if (i > 0) {
                    const prev = sideRows[i - 1];
                    if (Number(r.side_aura_points) !== Number(prev.side_aura_points) ||
                        Number(r.total_attempts) !== Number(prev.total_attempts)) {
                        sideRank = i + 1;
                    }
                }
                sideParticipantMap.set(r.user_id, sideRank);
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
                    [student.user_id, activeSeason.season_id, cat.id, finalRank, totalParticipants, awardedTitle, status]
                );
            }
        }

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

const takeDailyRankSnapshot = async () => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [seasonRows] = await connection.execute(
            `SELECT season_id, last_snapshot_date FROM seasons WHERE is_active = 1 FOR UPDATE`
        );
        if (seasonRows.length === 0) {
            await connection.commit();
            return;
        }

        const activeSeason = seasonRows[0];
        const todayStr = new Date().toISOString().split('T')[0];

        const lastSnapshotStr = activeSeason.last_snapshot_date
            ? new Date(activeSeason.last_snapshot_date).toISOString().split('T')[0]
            : null;

        if (lastSnapshotStr === todayStr) {
            await connection.commit();
            return;
        }

        // MySQL 5.7 compatible — fetch and rank in JS
        const [rankRows] = await connection.execute(
            `SELECT user_id, aura_points, total_attempts, stat_id
             FROM leaderboard_stats
             WHERE season_id = ?
             ORDER BY aura_points DESC, total_attempts ASC, stat_id ASC
             LIMIT 100`,
            [activeSeason.season_id]
        );

        if (rankRows.length > 0) {
            const values = [];
            const placeholders = [];

            let rank = 1;
            for (let i = 0; i < rankRows.length; i++) {
                const r = rankRows[i];
                if (i > 0) {
                    const prev = rankRows[i - 1];
                    if (Number(r.aura_points) !== Number(prev.aura_points) ||
                        Number(r.total_attempts) !== Number(prev.total_attempts)) {
                        rank = i + 1;
                    }
                }
                placeholders.push('(?, ?, ?, ?)');
                values.push(r.user_id, activeSeason.season_id, todayStr, rank);
            }

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
