const session = require("express-session");
const RedisStore = require("connect-redis").default;
const { createClient } = require("redis");

// Use Upstash Redis with standard redis client via REST URL
const redisClient = createClient({
  url: process.env.UPSTASH_REDIS_REST_URL,
  password: process.env.UPSTASH_REDIS_REST_TOKEN,
  socket: {
    tls: true,
    rejectUnauthorized: false
  }
});

redisClient.connect().catch(console.error);

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
