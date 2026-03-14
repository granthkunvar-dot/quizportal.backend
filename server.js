const express = require("express");
const cors = require("cors");
require("dotenv").config();
const sessionMiddleware = require("./config/session");
const authRoutes = require("./routes/authRoutes");
const studentRoutes = require("./routes/studentRoutes");
const adminAuthRoutes = require("./routes/adminAuth");
const adminRoutes = require("./routes/adminRoutes");
const followRoutes = require("./routes/followRoutes");
const instructorRoutes = require("./routes/instructorRoutes");
const leaderboardRoutes = require("./routes/leaderboardRoutes");
const searchRoutes = require("./routes/searchRoutes");

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(
  cors({
    origin: ["https://quizportalonline.netlify.app"],
    credentials: true
  })
);
app.use(sessionMiddleware);

app.get("/", (req, res) => {
  res.json({ status: "Quiz Portal Backend Running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/follow", followRoutes);
app.use("/api/instructor", instructorRoutes);
app.use("/api/leaderboards", leaderboardRoutes);
app.use("/api/search", searchRoutes);

app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

module.exports = app;
