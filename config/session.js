const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);

const dbOptions = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  createDatabaseTable: true,

  schema: {
    tableName: "sessions",
    columnNames: {
      session_id: "session_id",
      expires: "expires",
      data: "data"
    }
  }
};

const sessionStore = new MySQLStore(dbOptions);

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
