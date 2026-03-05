const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const db = require('./db'); // Your database connection file
require('dotenv').config();

// 1. Initialize Express and Server
const app = express();
const server = http.createServer(app);

// 2. Configure Socket.io with CORS for Netlify
const io = socketIo(server, {
    cors: {
        origin: [process.env.FRONTEND_URL, "http://localhost:5173"],
        methods: ["GET", "POST"]
    }
});

// 3. Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

// 4. Import your newly organized Routes
const authRoutes = require('./routes/authRoutes');
const quizRoutes = require('./routes/quizRoutes');
const adminRoutes = require('./routes/adminRoutes');

// 5. Use Routes
app.use('/api/auth', authRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/admin', adminRoutes);

// 6. Basic Health Check for Vercel
app.get('/', (req, res) => {
    res.json({ message: "QuizPortal API is Live!", status: "Connected" });
});

// 7. Socket.io Logic
io.on('connection', (socket) => {
    console.log('User connected to chat');
    socket.on('disconnect', () => console.log('User disconnected'));
});

// 8. Vercel Export (Crucial)
// This allows Vercel to treat the app as a single serverless function
module.exports = app;

// 9. Local Development Start
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
        console.log(`Server running locally on port ${PORT}`);
    });
}
