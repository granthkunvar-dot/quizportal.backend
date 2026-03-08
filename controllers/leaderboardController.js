const pool = require("../config/db");
const { closeSeasonIfExpired } = require("../services/seasonService");

const getGlobalLeaderboard = async (req, res) => {
    try {
        await closeSeasonIfExpired();
        const [seasonRows] = await pool.execute(
            "SELECT season_id, start_date, end_date FROM seasons WHERE is_active = 1 LIMIT 1"
        );

        if (seasonRows.length === 0) {
            return res.status(200).json({ season: null, rankings: [] });
        }
        const activeSeason = seasonRows[0];

        const [rankings] = await pool.execute(
            `SELECT 
        u.full_name,
        u.display_name,
        u.is_verified,
        ls.aura_points,
        ls.total_possible_weighted_points,
        ls.total_attempts,
        (ls.aura_points / NULLIF(ls.total_possible_weighted_points, 0)) * LOG10(ls.total_attempts + 1) AS ranking_score
       FROM leaderboard_stats ls
       JOIN users u ON u.user_id = ls.user_id
       WHERE ls.season_id = ? AND ls.total_attempts > 0 AND u.role = 'student' AND u.status = 'active'
       ORDER BY ls.aura_points DESC
       LIMIT 50`,
            [activeSeason.season_id]
        );

        // Optional: Calculate rank change based on previous season
        // For simplicity, we just return the calculated score and rank index in the frontend
        const formattedRankings = rankings.map((r, index) => ({
            rank: index + 1,
            fullName: r.full_name,
            displayName: r.display_name,
            isVerified: !!r.is_verified,
            rankingScore: Number(r.ranking_score).toFixed(2), // Optional fallback
            totalAttempts: r.total_attempts,
            auraPoints: Number(r.aura_points).toFixed(2)
        }));

        return res.status(200).json({
            season: {
                seasonId: activeSeason.season_id,
                startDate: activeSeason.start_date,
                endDate: activeSeason.end_date
            },
            rankings: formattedRankings
        });
    } catch (error) {
        console.error("Error fetching global leaderboard:", error);
        return res.status(500).json({ message: "Server error" });
    }
};

const getCategoryLeaderboard = async (req, res) => {
    try {
        const { category } = req.params;
        if (!category) {
            return res.status(400).json({ message: "Category is required" });
        }

        await closeSeasonIfExpired();

        const [seasonRows] = await pool.execute(
            "SELECT season_id, start_date, end_date FROM seasons WHERE is_active = 1 LIMIT 1"
        );

        if (seasonRows.length === 0) {
            return res.status(200).json({ season: null, rankings: [] });
        }
        const activeSeason = seasonRows[0];

        const [rankings] = await pool.execute(
            `SELECT 
        u.full_name,
        u.display_name,
        u.is_verified,
        sls.side_aura_points,
        sls.total_attempts,
        RANK() OVER (ORDER BY sls.side_aura_points DESC, sls.total_attempts ASC, sls.id ASC) as final_rank
       FROM side_leaderboard_stats sls
       JOIN users u ON u.user_id = sls.user_id
       WHERE sls.season_id = ? AND sls.category = ? AND u.role = 'student' AND u.status = 'active'
       ORDER BY final_rank ASC
       LIMIT 50`,
            [activeSeason.season_id, category]
        );

        const formattedRankings = rankings.map((r) => ({
            rank: Number(r.final_rank),
            fullName: r.full_name,
            displayName: r.display_name,
            isVerified: !!r.is_verified,
            totalAttempts: Number(r.total_attempts),
            auraPoints: Number(r.side_aura_points).toFixed(2)
        }));

        return res.status(200).json({
            season: {
                seasonId: activeSeason.season_id,
                endDate: activeSeason.end_date
            },
            category,
            rankings: formattedRankings
        });
    } catch (error) {
        console.error("Error fetching category leaderboard:", error);
        return res.status(500).json({ message: "Server error" });
    }
};

module.exports = {
    getGlobalLeaderboard,
    getCategoryLeaderboard
};



