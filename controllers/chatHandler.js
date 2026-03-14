const pool = require("../config/db");
const Pusher = require("pusher");

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true
});

// GET /api/chat/history - fetch last 50 messages
const getChatHistory = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT c.id, c.message, c.created_at,
              u.display_name, u.profile_picture_url, u.lifetime_aura, u.current_core_title, u.is_verified
       FROM chat_messages c
       JOIN users u ON c.user_id = u.user_id
       WHERE c.room = 'worldwide'
       ORDER BY c.created_at DESC
       LIMIT 50`,
    );

    const messages = rows.reverse().map(r => ({
      id: r.id,
      message: r.message,
      timestamp: r.created_at,
      author: {
        displayName: r.display_name,
        profilePictureUrl: r.profile_picture_url,
        lifetimeAura: Number(r.lifetime_aura),
        title: r.current_core_title,
        isVerified: !!r.is_verified
      }
    }));

    return res.status(200).json({ messages });
  } catch (error) {
    console.error("Error fetching chat history:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// POST /api/chat/message - send a message
const sendMessage = async (req, res) => {
  try {
    const userId = req.session.user.userId;
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ message: "Invalid message" });
    }

    const messageText = message.trim().substring(0, 500);
    if (messageText.length === 0) {
      return res.status(400).json({ message: "Message cannot be empty" });
    }

    // Fetch user details
    const [userRows] = await pool.execute(
      `SELECT display_name, profile_picture_url, lifetime_aura, current_core_title, is_verified
       FROM users WHERE user_id = ? LIMIT 1`,
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userRows[0];

    // Save to database
    const [result] = await pool.execute(
      `INSERT INTO chat_messages (user_id, message, room) VALUES (?, ?, 'worldwide')`,
      [userId, messageText]
    );

    const newMessage = {
      id: result.insertId,
      message: messageText,
      timestamp: new Date().toISOString(),
      author: {
        displayName: user.display_name,
        profilePictureUrl: user.profile_picture_url,
        lifetimeAura: Number(user.lifetime_aura),
        title: user.current_core_title,
        isVerified: !!user.is_verified
      }
    };

    // Broadcast via Pusher
    await pusher.trigger("worldwide-chat", "new-message", newMessage);

    return res.status(201).json({ success: true, message: newMessage });
  } catch (error) {
    console.error("Error sending message:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { getChatHistory, sendMessage };
