const session = require("express-session");
const RedisStore = require("connect-redis").default;
const Redis = require("ioredis");

const redisClient = new Redis(process.env.UPSTASH_REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  lazyConnect: false
});

redisClient.on("error", (err) => {
  console.error("Redis error:", err.message);
});

const store = new RedisStore({
  client: redisClient,
  prefix: "quizportal:",
  disableTouch: true
});

const sessionMiddleware = session({
  name: "quizportal.sid",
  secret: process.env.SESSION_SECRET || "dev-secret",
  store,
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
