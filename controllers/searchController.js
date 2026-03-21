const pool = require("../config/db");

const searchUsers = async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.status(200).json({ results: [] });
        }
        const safeQuery = query.trim();
        const [rows] = await pool.execute(
            `SELECT user_id, display_name, profile_picture_url, lifetime_aura, is_verified 
             FROM users 
             WHERE status = 'active' 
               AND display_name LIKE CONCAT('%', ?, '%') 
             ORDER BY lifetime_aura DESC 
             LIMIT 15`,
            [safeQuery]
        );
        const results = rows.map(r => ({
            userId: r.user_id,
            displayName: r.display_name,
            profilePictureUrl: r.profile_picture_url,
            lifetimeAura: Number(r.lifetime_aura),
            isVerified: !!r.is_verified
        }));
        return res.status(200).json({ results });
    } catch (error) {
        console.error("Error in searchUsers:", error);
        return res.status(500).json({ message: "Server error during search processing." });
    }
};

const getPublicProfile = async (req, res) => {
    try {
        const { displayName } = req.params;
        const [userRows] = await pool.execute(
            `SELECT user_id, full_name, display_name, lifetime_aura, profile_picture_url, 
                    specialization, current_core_title, created_at, current_streak,
                    reputation_score, is_verified,
                    (SELECT COUNT(*) FROM follows WHERE following_id = u.user_id) as follower_count,
                    (SELECT COUNT(*) FROM follows WHERE follower_id = u.user_id) as following_count
             FROM users u
             WHERE display_name = ? AND role = 'student' AND status = 'active'
             LIMIT 1`,
            [displayName]
        );
        if (userRows.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }
        const user = userRows[0];
        return res.status(200).json({
            profile: {
                userId: user.user_id,
                fullName: user.full_name,
                displayName: user.display_name,
                lifetimeAura: Number(user.lifetime_aura).toFixed(2),
                profilePictureUrl: user.profile_picture_url,
                specialization: user.specialization,
                currentCoreTitle: user.current_core_title,
                joinedAt: user.created_at,
                streak: user.current_streak,
                reputationScore: user.reputation_score,
                isVerified: !!user.is_verified,
                followerCount: Number(user.follower_count),
                followingCount: Number(user.following_count)
            }
        });
    } catch (error) {
        console.error("Error in getPublicProfile:", error);
        return res.status(500).json({ message: "Server error" });
    }
};

module.exports = {
    searchUsers,
    getPublicProfile
};
