const session = require("express-session");
const { Redis } = require("@upstash/redis");
const RedisStore = require("connect-redis").default;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const sessionMiddleware = session({
  name: "quizportal.sid",
  secret: process.env.SESSION_SECRET || "dev-secret",
  store: new RedisStore({ client: redis }),
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
