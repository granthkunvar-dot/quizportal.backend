const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);

const options = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  ssl: {
    rejectUnauthorized: false
  },

  createDatabaseTable: true
};

const sessionStore = new MySQLStore(options);

const sessionMiddleware = session({
  name: "quizportal.sid",
  secret: process.env.SESSION_SECRET,

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
