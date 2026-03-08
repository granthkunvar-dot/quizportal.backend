const { pool } = require("../config/db");

// Follow a user
const followUser = async (req, res) => {
    try {
        const followerId = req.session.user.userId;
        const followingId = parseInt(req.params.id, 10);

        if (isNaN(followingId)) {
            return res.status(400).json({ message: "Invalid user ID formulation" });
        }

        if (followerId === followingId) {
            return res.status(400).json({ message: "You cannot follow yourself." });
        }

        // Check if user exists and is not suspended
        const [userExists] = await pool.execute(
            "SELECT status FROM users WHERE user_id = ?",
            [followingId]
        );

        if (userExists.length === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        if (userExists[0].status === 'suspended') {
            return res.status(403).json({ message: "Cannot follow a suspended user." });
        }

        // Insert ignoring duplicates
        await pool.execute(
            "INSERT IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)",
            [followerId, followingId]
        );

        return res.status(200).json({ message: "Successfully followed user." });

    } catch (e) {
        console.error("Error following user:", e);
        return res.status(500).json({ message: "Server error during follow execution." });
    }
};

// Unfollow a user
const unfollowUser = async (req, res) => {
    try {
        const followerId = req.session.user.userId;
        const followingId = parseInt(req.params.id, 10);

        if (isNaN(followingId)) {
            return res.status(400).json({ message: "Invalid user ID formulation" });
        }

        await pool.execute(
            "DELETE FROM follows WHERE follower_id = ? AND following_id = ?",
            [followerId, followingId]
        );

        return res.status(200).json({ message: "Successfully unfollowed user." });

    } catch (e) {
        console.error("Error unfollowing user:", e);
        return res.status(500).json({ message: "Server error during unfollow execution." });
    }
};

// Get followers
const getFollowers = async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);

        if (isNaN(userId)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        const [followers] = await pool.execute(
            `SELECT u.user_id as userId, u.display_name as displayName, u.profile_picture_url as profilePictureUrl, 
                    u.reputation_score as reputationScore, u.is_verified as isVerified, u.lifetime_aura as lifetimeAura
             FROM follows f
             JOIN users u ON u.user_id = f.follower_id
             WHERE f.following_id = ? AND u.status = 'active'
             ORDER BY f.created_at DESC`,
            [userId]
        );

        return res.status(200).json({ followers });

    } catch (e) {
        console.error("Error getting followers:", e);
        return res.status(500).json({ message: "Server error retrieving followers." });
    }
};

// Get following
const getFollowing = async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);

        if (isNaN(userId)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        const [following] = await pool.execute(
            `SELECT u.user_id as userId, u.display_name as displayName, u.profile_picture_url as profilePictureUrl, 
                    u.reputation_score as reputationScore, u.is_verified as isVerified, u.lifetime_aura as lifetimeAura
             FROM follows f
             JOIN users u ON u.user_id = f.following_id
             WHERE f.follower_id = ? AND u.status = 'active'
             ORDER BY f.created_at DESC`,
            [userId]
        );

        return res.status(200).json({ following });

    } catch (e) {
        console.error("Error getting following:", e);
        return res.status(500).json({ message: "Server error retrieving following." });
    }
};

// Get Public Profile by string display_name
const getPublicProfile = async (req, res) => {
    try {
        const { displayName } = req.params;

        if (!displayName) {
            return res.status(400).json({ message: "Display name parameter is required." });
        }

        const [userRows] = await pool.execute(
            `SELECT user_id, full_name, display_name, profile_picture_url, 
                    reputation_score, is_verified, lifetime_aura, created_at, status, 
                    (SELECT COUNT(*) FROM follows WHERE following_id = users.user_id) as follower_count,
                    (SELECT COUNT(*) FROM follows WHERE follower_id = users.user_id) as following_count
             FROM users
             WHERE LOWER(display_name) = LOWER(?) AND role = 'student'
             LIMIT 1`,
            [displayName]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        const user = userRows[0];

        if (user.status === 'suspended') {
            return res.status(403).json({ message: "This account has been suspended." });
        }

        const publicProfile = {
            userId: user.user_id,
            fullName: user.full_name,
            displayName: user.display_name,
            profilePictureUrl: user.profile_picture_url,
            reputationScore: user.reputation_score,
            isVerified: !!user.is_verified,
            lifetimeAura: Number(user.lifetime_aura).toFixed(2),
            joinedAt: user.created_at,
            followerCount: user.follower_count,
            followingCount: user.following_count
        };

        return res.status(200).json({ profile: publicProfile });

    } catch (e) {
        console.error("Error fetching public profile:", e);
        return res.status(500).json({ message: "Server error fetching profile." });
    }
};

module.exports = {
    followUser,
    unfollowUser,
    getFollowers,
    getFollowing,
    getPublicProfile
};


