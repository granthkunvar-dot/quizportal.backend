const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const db = require('./db'); 
require('dotenv').config();

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

// 4. Import Routes (Updated for your new folder structure)
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const adminAuth = require('./routes/adminAuth'); // Added this because you moved it to /routes

// 5. Use Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/auth', adminAuth); // Dedicated path for Admin login

// 6. Health Check
app.get('/', (req, res) => {
    res.json({ message: "QuizPortal API is Live!", status: "Connected" });
});

// 7. Socket.io
io.on('connection', (socket) => {
    console.log('User connected to chat');
    socket.on('disconnect', () => console.log('User disconnected'));
});

// 8. Vercel Export
module.exports = app;

// 9. Local Development
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
        console.log(`Server running locally on port ${PORT}`);
    });
}
