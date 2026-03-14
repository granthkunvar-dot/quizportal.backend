const pool = require("../config/db");
const { closeSeasonIfExpired } = require("../services/seasonService");
const path = require("path");
const fs = require("fs").promises;
const sharp = require("sharp");
const crypto = require("crypto");

const getProfile = async (req, res) => {
    try {
        const studentId = req.session.user.userId;

        await closeSeasonIfExpired();

        const [userRows] = await pool.execute(
            `SELECT full_name, email, lifetime_aura, profile_picture_url, display_name, specialization, current_core_title, created_at, current_streak,
               reputation_score, is_verified,
               (SELECT COUNT(*) FROM follows WHERE following_id = ?) as follower_count,
               (SELECT COUNT(*) FROM follows WHERE follower_id = ?) as following_count
             FROM users
             WHERE user_id = ? AND role = 'student' AND status = 'active'
             LIMIT 1`,
            [studentId, studentId, studentId]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ message: "Student profile not found" });
        }
        const user = userRows[0];

        const [activeSeasonRows] = await pool.execute(
            `SELECT season_id FROM seasons WHERE is_active = 1 LIMIT 1`
        );

        let activeSeasonStats = null;
        if (activeSeasonRows.length > 0) {
            const activeSeasonId = activeSeasonRows[0].season_id;

            // MySQL 5.7 compatible rank calculation
            const [myStatsRows] = await pool.execute(
                `SELECT aura_points, total_attempts, stat_id FROM leaderboard_stats WHERE season_id = ? AND user_id = ?`,
                [activeSeasonId, studentId]
            );

            if (myStatsRows.length > 0) {
                const myStats = myStatsRows[0];

                const [rankRows] = await pool.execute(
                    `SELECT COUNT(*) + 1 as final_rank
                     FROM leaderboard_stats
                     WHERE season_id = ?
                     AND (
                       aura_points > ?
                       OR (aura_points = ? AND total_attempts < ?)
                       OR (aura_points = ? AND total_attempts = ? AND stat_id < ?)
                     )`,
                    [activeSeasonId,
                     myStats.aura_points,
                     myStats.aura_points, myStats.total_attempts,
                     myStats.aura_points, myStats.total_attempts, myStats.stat_id]
                );

                const [totalActiveRows] = await pool.execute(
                    `SELECT COUNT(*) as total FROM leaderboard_stats WHERE season_id = ?`,
                    [activeSeasonId]
                );

                activeSeasonStats = {
                    rank: Number(rankRows[0].final_rank),
                    totalParticipants: Number(totalActiveRows[0].total),
                    seasonAura: Number(myStats.aura_points)
                };
            }
        }

        const [historyRows] = await pool.execute(
            `SELECT 
               usr.season_id, s.start_date, s.end_date,
               usr.final_rank, usr.total_participants, usr.season_aura,
               usr.participation_status, usr.awarded_title
             FROM user_season_results usr
             JOIN seasons s ON s.season_id = usr.season_id
             WHERE usr.user_id = ?
             ORDER BY s.end_date DESC`,
            [studentId]
        );

        const formattedHistory = historyRows.map(row => ({
            seasonId: row.season_id,
            startDate: row.start_date,
            endDate: row.end_date,
            finalRank: row.final_rank !== null ? Number(row.final_rank) : null,
            totalParticipants: Number(row.total_participants),
            seasonAura: Number(row.season_aura),
            status: row.participation_status,
            awardedTitle: row.awarded_title
        }));

        const [sideHistoryRows] = await pool.execute(
            `SELECT 
               usr.season_id, s.start_date, s.end_date,
               usr.category, usr.final_rank, usr.total_participants,
               usr.participation_status, usr.awarded_title
             FROM user_side_season_results usr
             JOIN seasons s ON s.season_id = usr.season_id
             WHERE usr.user_id = ? AND usr.participation_status = 'participated'
             ORDER BY s.end_date DESC`,
            [studentId]
        );

        const formattedSideHistory = sideHistoryRows.map(row => ({
            seasonId: row.season_id,
            startDate: row.start_date,
            endDate: row.end_date,
            category: row.category,
            finalRank: Number(row.final_rank),
            totalParticipants: Number(row.total_participants),
            status: row.participation_status,
            awardedTitle: row.awarded_title
        }));

        const [percentileRows] = await pool.execute(
            `SELECT 
                (SELECT COUNT(*) FROM users WHERE role = 'student' AND status = 'active') as total_students,
                (SELECT COUNT(*) FROM users WHERE role = 'student' AND status = 'active' AND lifetime_aura > u.lifetime_aura) as rank_above
             FROM users u WHERE u.user_id = ?`,
            [studentId]
        );
        let totalStudents = 1;
        let rankAbove = 0;
        if (percentileRows.length > 0) {
            totalStudents = Number(percentileRows[0].total_students);
            rankAbove = Number(percentileRows[0].rank_above);
        }
        const userRank = rankAbove + 1;
        const percentile = totalStudents > 1 ? ((totalStudents - userRank) / (totalStudents - 1)) * 100 : 100;

        const [statRows] = await pool.execute(
            `SELECT 
                (SELECT COUNT(*) FROM user_season_results WHERE user_id = ? AND participation_status = 'participated') as seasons_played,
                (SELECT MIN(final_rank) FROM user_season_results WHERE user_id = ? AND participation_status = 'participated') as best_rank,
                (SELECT COUNT(*) FROM attempts WHERE student_id = ? AND status = 'graded') as total_attempts,
                (SELECT COUNT(CASE WHEN q.difficulty = 'hard' AND a.is_correct = 1 THEN 1 END) 
                 FROM answers a 
                 JOIN attempts att ON a.attempt_id = att.attempt_id 
                 JOIN questions q ON a.question_id = q.question_id 
                 WHERE att.student_id = ? AND att.status = 'graded') as hard_correct,
                (SELECT COUNT(CASE WHEN q.difficulty = 'hard' AND a.is_correct IS NOT NULL THEN 1 END) 
                 FROM answers a 
                 JOIN attempts att ON a.attempt_id = att.attempt_id 
                 JOIN questions q ON a.question_id = q.question_id 
                 WHERE att.student_id = ? AND att.status = 'graded') as hard_total`,
            [studentId, studentId, studentId, studentId, studentId]
        );

        let advancedStats = {
            seasonsPlayed: 0,
            bestRank: null,
            totalAttempts: 0,
            hardAccuracy: 0
        };

        if (statRows.length > 0) {
            const row = statRows[0];
            advancedStats.seasonsPlayed = Number(row.seasons_played);
            advancedStats.bestRank = row.best_rank !== null ? Number(row.best_rank) : null;
            advancedStats.totalAttempts = Number(row.total_attempts);
            const hardCorrect = Number(row.hard_correct || 0);
            const hardTotal = Number(row.hard_total || 0);
            advancedStats.hardAccuracy = hardTotal > 0 ? (hardCorrect / hardTotal) * 100 : 0;
        }

        const [achieveRows] = await pool.execute(
            `SELECT achievement_key, unlocked_at FROM achievements WHERE user_id = ? ORDER BY unlocked_at DESC`,
            [studentId]
        );
        const achievements = achieveRows.map(a => ({
            key: a.achievement_key,
            unlockedAt: a.unlocked_at
        }));

        return res.status(200).json({
            profile: {
                fullName: user.full_name,
                displayName: user.display_name,
                email: user.email,
                profilePictureUrl: user.profile_picture_url,
                specialization: user.specialization,
                currentCoreTitle: user.current_core_title,
                lifetimeAura: Number(user.lifetime_aura).toFixed(2),
                joinedAt: user.created_at,
                percentile: Number(percentile.toFixed(1)),
                streak: user.current_streak,
                reputationScore: user.reputation_score,
                isVerified: !!user.is_verified,
                followerCount: user.follower_count,
                followingCount: user.following_count
            },
            advancedStats,
            activeSeason: activeSeasonStats,
            history: formattedHistory,
            sideHistory: formattedSideHistory,
            achievements
        });

    } catch (error) {
        console.error("Error fetching profile:", error);
        return res.status(500).json({ message: "Server error" });
    }
};

const getLiveDashboardStats = async (req, res) => {
    try {
        const studentId = req.session.user.userId;
        await closeSeasonIfExpired();

        const [seasonRows] = await pool.execute(
            `SELECT season_id, end_date FROM seasons WHERE is_active = 1 LIMIT 1`
        );
        if (seasonRows.length === 0) return res.status(200).json({ noActiveSeason: true });

        const activeSeason = seasonRows[0];

        const [userRows] = await pool.execute(
            `SELECT current_streak, lifetime_aura FROM users WHERE user_id = ? LIMIT 1`,
            [studentId]
        );
        const user = userRows[0];

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        // MySQL 5.7 compatible rank calculation
        const [myStatsRows] = await pool.execute(
            `SELECT aura_points, total_attempts, stat_id FROM leaderboard_stats WHERE season_id = ? AND user_id = ?`,
            [activeSeason.season_id, studentId]
        );

        let currentRank = null;
        let currentAura = 0;

        if (myStatsRows.length > 0) {
            const myStats = myStatsRows[0];
            currentAura = Number(myStats.aura_points);

            const [rankRows] = await pool.execute(
                `SELECT COUNT(*) + 1 as final_rank
                 FROM leaderboard_stats
                 WHERE season_id = ?
                 AND (
                   aura_points > ?
                   OR (aura_points = ? AND total_attempts < ?)
                   OR (aura_points = ? AND total_attempts = ? AND stat_id < ?)
                 )`,
                [activeSeason.season_id,
                 myStats.aura_points,
                 myStats.aura_points, myStats.total_attempts,
                 myStats.aura_points, myStats.total_attempts, myStats.stat_id]
            );
            currentRank = Number(rankRows[0].final_rank);
        }

        const [snapshotRows] = await pool.execute(
            `SELECT rank_value FROM daily_rank_snapshots WHERE user_id = ? AND snapshot_date = ?`,
            [studentId, yesterdayStr]
        );

        const yesterdayRank = snapshotRows.length > 0 ? Number(snapshotRows[0].rank_value) : currentRank;

        let momentum = 0;
        if (currentRank && yesterdayRank) {
            momentum = yesterdayRank - currentRank;
        }

        // Rival — find user with next higher aura
        let rival = null;
        if (currentRank && currentRank > 1 && myStatsRows.length > 0) {
            const [rivalRows] = await pool.execute(
                `SELECT ls.user_id, ls.aura_points, u.full_name
                 FROM leaderboard_stats ls
                 JOIN users u ON u.user_id = ls.user_id
                 WHERE ls.season_id = ? AND ls.aura_points > ?
                 ORDER BY ls.aura_points ASC
                 LIMIT 1`,
                [activeSeason.season_id, myStatsRows[0].aura_points]
            );

            if (rivalRows.length > 0) {
                rival = {
                    name: rivalRows[0].full_name,
                    rank: currentRank - 1,
                    auraToBeat: Number(rivalRows[0].aura_points) - currentAura
                };
            }
        }

        return res.status(200).json({
            seasonEndDate: activeSeason.end_date,
            streak: user.current_streak,
            currentRank,
            momentum,
            rival
        });

    } catch (e) {
        console.error("Error fetching live dashboard stats:", e);
        return res.status(500).json({ message: "Server Error" });
    }
};

const isValidDisplayName = (name) => {
    if (!name || typeof name !== "string") return false;
    const clean = name.trim();
    if (!/^[a-zA-Z0-9_ ]{3,30}$/.test(clean)) return false;
    const reservedWords = ['admin', 'system', 'root', 'moderator'];
    if (reservedWords.includes(clean.toLowerCase())) return false;
    return true;
};

const updateProfile = async (req, res) => {
    try {
        const studentId = req.session.user.userId;
        const { displayName, specialization } = req.body;

        if (displayName) {
            const cleanDisplayName = displayName.trim();
            if (!isValidDisplayName(cleanDisplayName)) {
                return res.status(400).json({ message: "Display Name must be 3-30 characters, alphanumeric, underscores, or spaces only" });
            }

            const [existing] = await pool.execute(
                "SELECT user_id FROM users WHERE LOWER(display_name) = LOWER(?) AND user_id != ?",
                [cleanDisplayName, studentId]
            );

            if (existing.length > 0) {
                return res.status(409).json({ message: "Display Name already taken by another user." });
            }

            await pool.execute(
                "UPDATE users SET display_name = ? WHERE user_id = ?",
                [cleanDisplayName, studentId]
            );
        }

        if (specialization !== undefined) {
            const cleanSpecialization = String(specialization).trim().substring(0, 50);
            await pool.execute(
                "UPDATE users SET specialization = ? WHERE user_id = ?",
                [cleanSpecialization || null, studentId]
            );
        }

        if (req.file) {
            const uploadsDir = path.join(__dirname, "..", "..", "uploads", "avatars");
            await fs.mkdir(uploadsDir, { recursive: true });

            const filename = `${crypto.randomUUID()}.png`;
            const filepath = path.join(uploadsDir, filename);

            await sharp(req.file.buffer)
                .resize(256, 256, { fit: "cover" })
                .png()
                .toFile(filepath);

            const profilePictureUrl = `/uploads/avatars/${filename}`;
            await pool.execute(
                "UPDATE users SET profile_picture_url = ? WHERE user_id = ?",
                [profilePictureUrl, studentId]
            );
        }

        return res.status(200).json({ message: "Profile updated successfully." });

    } catch (e) {
        console.error("Error updating profile:", e);
        return res.status(500).json({ message: "Server error processing profile updates." });
    }
};

module.exports = {
    getProfile,
    getLiveDashboardStats,
    updateProfile
};
