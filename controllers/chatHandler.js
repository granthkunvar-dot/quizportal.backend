const { pool } = require("../config/db");

const initSocket = (io, sessionMiddleware) => {
    // 1. Wrap Express session middleware for Socket.io
    io.use((socket, next) => {
        sessionMiddleware(socket.request, socket.request.res || {}, next);
    });

    // 2. Strong Socket Authentication hook
    io.use((socket, next) => {
        const session = socket.request.session;
        if (session && session.user && session.user.userId) {
            socket.user = session.user;
            next();
        } else {
            console.warn(`[Socket.io] Unauthenticated connection rejected.`);
            next(new Error("unauthorized"));
        }
    });

    // 3. Connection & Emitters
    io.on("connection", async (socket) => {
        const userId = socket.user.userId;
        const room = "worldwide";

        socket.on("join_worldwide", async () => {
            console.log(`[Socket] User ${socket.user.displayName || socket.user.fullName} requested to join worldwide.`);
            socket.join(room);
            console.log(`[Socket] User successfully joined room: ${room}`);

            // Emit recent history onto clients when they join the namespace
            try {
                const [rows] = await pool.execute(
                    `SELECT c.id, c.message, c.created_at, 
                            u.display_name, u.profile_picture_url, u.lifetime_aura, u.current_core_title, u.is_verified
                     FROM chat_messages c
                     JOIN users u ON c.user_id = u.user_id
                     WHERE c.room = ?
                     ORDER BY c.created_at DESC
                     LIMIT 50`,
                    [room]
                );

                // Reorder historically (oldest -> newest for rendering)
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

                socket.emit("chat_history", messages);
            } catch (error) {
                console.error("Socket error fetching history:", error);
            }
        });

        // 4. Message Received execution
        socket.on("send_message", async (data) => {
            console.log(`[Socket] Server received 'send_message' from ${socket.user.displayName || socket.user.fullName}:`, data);
            if (!data || !data.message || typeof data.message !== 'string') return;

            const messageText = data.message.trim().substring(0, 500); // 500 char cap
            if (messageText.length === 0) return;

            try {
                // Real-time lookup ensures exact prestige variables broadcast correctly
                const [userRows] = await pool.execute(
                    `SELECT display_name, profile_picture_url, lifetime_aura, current_core_title, is_verified 
                     FROM users WHERE user_id = ? LIMIT 1`,
                    [userId]
                );

                if (userRows.length === 0) return;
                const user = userRows[0];

                const [result] = await pool.execute(
                    `INSERT INTO chat_messages (user_id, message, room) VALUES (?, ?, ?)`,
                    [userId, messageText, room]
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

                // Broadcast directly to active room
                console.log(`[Socket] Broadcasting message to worldwide room:`, newMessage);
                io.to(room).emit("new_message", newMessage);

            } catch (error) {
                console.error("Socket error saving message:", error);
            }
        });
    });
};

module.exports = { initSocket };
