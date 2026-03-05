const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: toNumber(process.env.PORT, 5000),
  quiz: {
    timeLimitMinutes: toNumber(process.env.QUIZ_TIME_LIMIT_MINUTES, 30)
  },
  db: {
    host: process.env.DB_HOST || "localhost",
    port: toNumber(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "quiz_portal",
    connectionLimit: toNumber(process.env.DB_CONNECTION_LIMIT, 10)
  },
  session: {
    secret: process.env.SESSION_SECRET || "change-me-in-env",
    name: process.env.SESSION_NAME || "sid",
    maxAge: toNumber(process.env.SESSION_MAX_AGE_MS, 1000 * 60 * 60 * 24)
  }
};
