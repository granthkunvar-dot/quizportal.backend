require('dotenv').config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { port } = require("./config/env");
const PORT = process.env.PORT || 5000;
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, "http://localhost:5173"]
  : ["http://localhost:5173"];
const { testConnection } = require("./config/db");
const { createSessionMiddleware } = require("./config/session");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const instructorRoutes = require("./routes/instructorRoutes");
const studentRoutes = require("./routes/studentRoutes");
const searchRoutes = require("./routes/searchRoutes");
const followRoutes = require("./routes/followRoutes");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const { initSocket } = require("./socket/chatHandler");

const app = express();
const server = http.createServer(app);

app.use(helmet({ crossOriginResourcePolicy: false })); // Allow cross origin resources for images

app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.use(morgan("dev"));
app.use(express.json());

const sessionMiddleware = createSessionMiddleware();
app.use(sessionMiddleware);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }
});
initSocket(io, sessionMiddleware);

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/instructor", instructorRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/leaderboards", require("./routes/leaderboardRoutes"));
app.use("/api/users", searchRoutes);
app.use("/api/users", followRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});


/* 🔴 REAL ERROR LOGGER (temporary for debugging) */
app.use((err, req, res, next) => {
  console.log("\n========== BACKEND ERROR ==========");
  console.log(err);
  console.log("===================================\n");

  res.status(500).json({
    message: err.message,
    sql: err.sqlMessage || null,
    code: err.code || null
  });
});

const startServer = async () => {
  await testConnection();
  server.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT} with Socket.io`);
  });
};

startServer().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});