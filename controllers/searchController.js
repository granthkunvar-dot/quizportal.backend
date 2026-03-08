const  pool = require("../config/db");

const searchUsers = async (req, res) => {
    try {
        const query = req.query.q;
        // Require at least a non-empty string to process a search to protect overhead
        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.status(200).json({ results: [] });
        }

        const safeQuery = query.trim();

        // Search display_name dynamically using explicit wildcards
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

module.exports = {
    searchUsers
};



