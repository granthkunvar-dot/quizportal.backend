const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);

// Reuse the same pool instead of opening new connections
const pool = require("./db");

const sessionStore = new MySQLStore({}, pool);

const sessionMiddleware = session({
  name: "quizportal.sid",
  secret: process.env.SESSION_SECRET || "dev-secret",
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 1000 * 60 * 60 * 24
  }
});

module.exports = sessionMiddleware;
