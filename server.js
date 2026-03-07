const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session'); 
const db = require('./config/db'); 

const app = express();
const server = http.createServer(app);

// --- 1. THE ANTIGRAVITY SECURITY FIXES ---
app.set('trust proxy', 1); // Crucial: Tells Express to trust Vercel's Edge Proxy

// Updated CORS to explicitly allow your Netlify URL and allow cookies (credentials)
const allowedOrigins = [process.env.FRONTEND_URL, "https://quizportalonline.netlify.app", "http://localhost:5173"];
app.use(cors({
    origin: allowedOrigins,
    credentials: true, // THIS IS THE MAGIC KEY THAT ALLOWS LOGINS TO WORK
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}));

app.use(express.json());

// --- 2. THE SESSION COOKIE FIXES ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'quiz_portal_fallback_secret', 
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        // If on Vercel (Production), use 'none' and 'secure'. If local, use 'lax'.
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));

// --- 3. YOUR ROUTES ---
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const studentRoutes = require('./routes/studentRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const instructorRoutes = require('./routes/instructorRoutes');
const followRoutes = require('./routes/followRoutes');
const searchRoutes = require('./routes/searchRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/instructor', instructorRoutes);
app.use('/api/follow', followRoutes);
app.use('/api/search', searchRoutes);

// Health Check
app.get('/', (req, res) => {
    res.json({ message: "QuizPortal API is Live!", status: "Connected" });
});

// --- 4. SOCKET.IO (Also needs credentials: true) ---
const io = socketIo(server, {
    cors: {
        origin: allowedOrigins,
        credentials: true,
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    console.log('User connected to chat');
    socket.on('disconnect', () => console.log('User disconnected'));
});

// Vercel Export
module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
        console.log(`Server running locally on port ${PORT}`);
    });
}
