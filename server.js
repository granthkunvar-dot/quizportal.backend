const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const db = require('./db'); 

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: [process.env.FRONTEND_URL, "http://localhost:5173"],
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

// 1. Import Routes (Only the REAL router files)
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const studentRoutes = require('./routes/studentRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');

// 2. Use Routes (Removed the broken adminAuth route!)
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes); 
app.use('/api/leaderboard', leaderboardRoutes);

// Health Check
app.get('/', (req, res) => {
    res.json({ message: "QuizPortal API is Live!", status: "Connected" });
});

// Socket.io
io.on('connection', (socket) => {
    console.log('User connected to chat');
    socket.on('disconnect', () => console.log('User disconnected'));
});

// Vercel Export
module.exports = app;

// Local Development Start
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
        console.log(`Server running locally on port ${PORT}`);
    });
}
