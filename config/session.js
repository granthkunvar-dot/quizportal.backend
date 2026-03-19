const session = require("express-session");
const RedisStore = require("connect-redis").default;
const Redis = require("ioredis");

const redisClient = new Redis({
  host: "boss-sparrow-72518.upstash.io",
  port: 6379,
  password: process.env.UPSTASH_REDIS_REST_TOKEN,
  tls: {},
  maxRetriesPerRequest: 1,
  connectTimeout: 5000,
  lazyConnect: true,
  enableOfflineQueue: false
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
