const session = require("express-session");
const { session: sessionConfig, nodeEnv } = require("./env");

const createSessionMiddleware = () =>
  session({
    name: sessionConfig.name,
    secret: sessionConfig.secret,
    resave: false,
    saveUninitialized: false,

    cookie: {
      httpOnly: true,

      // critical for localhost cross-port auth
      sameSite: "lax",

      // MUST stay false in localhost
      secure: false,

      maxAge: sessionConfig.maxAge
    }
  });

module.exports = {
  createSessionMiddleware
};