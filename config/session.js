const session = require("express-session");
const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Custom session store that works directly with Upstash
const expressSession = require("express-session");
class UpstashStore extends expressSession.Store {
  async get(sid, cb) {
    try {
      const data = await redis.get(`sess:${sid}`);
      cb(null, data || null);
    } catch (err) {
      cb(err);
    }
  }
  async set(sid, session, cb) {
    try {
      const ttl = session.cookie?.maxAge ? Math.floor(session.cookie.maxAge / 1000) : 86400;
      await redis.set(`sess:${sid}`, session, { ex: ttl });
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
