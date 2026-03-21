const session = require("express-session");
const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

class UpstashStore extends session.Store {
  async get(sid, cb) {
    try {
      const data = await redis.get(`sess:${sid}`);
      if (!data) return cb(null, null);
      // Upstash auto-parses JSON, so data is already an object
      const session = typeof data === "string" ? JSON.parse(data) : data;
      cb(null, session);
    } catch (err) {
      cb(err);
    }
  }

  async set(sid, sessionData, cb) {
    try {
      const ttl = sessionData.cookie?.maxAge
        ? Math.floor(sessionData.cookie.maxAge / 1000)
        : 86400;
      // Store as string to avoid double-serialization issues
      await redis.set(`sess:${sid}`, JSON.stringify(sessionData), { ex: ttl });
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  async destroy(sid, cb) {
    try {
      await redis.del(`sess:${sid}`);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
}

const sessionMiddleware = session({
  name: "quizportal.sid",
  secret: process.env.SESSION_SECRET || "dev-secret",
  store: new UpstashStore(),
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
