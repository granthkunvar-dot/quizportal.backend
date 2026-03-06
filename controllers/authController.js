const bcrypt = require("bcrypt");
const { pool } = require("../db");

const SALT_ROUNDS = 10;
const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

/* ================= REGISTER ================= */
const register = async (req, res) => {
  try {
    const { name, email, password, displayName } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ message: "Name is required" });
    if (!email || !email.trim()) return res.status(400).json({ message: "Email is required" });
    if (!password || password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
    if (!displayName || !displayName.trim()) return res.status(400).json({ message: "Display Name is required" });

    const cleanDisplayName = displayName.trim();
    const displayNameRegex = /^[a-zA-Z0-9_ ]{3,30}$/;
    if (!displayNameRegex.test(cleanDisplayName))
      return res.status(400).json({ message: "Display Name must be 3-30 characters, alphanumeric, underscores, or spaces only" });

    const reservedWords = ['admin', 'system', 'root', 'moderator'];
    if (reservedWords.includes(cleanDisplayName.toLowerCase()))
      return res.status(400).json({ message: "Display Name contains reserved words" });

    const normalizedEmail = normalizeEmail(email);

    const [existingEmail] = await pool.execute("SELECT user_id FROM users WHERE email = ?", [normalizedEmail]);
    if (existingEmail.length > 0) return res.status(409).json({ message: "Email already exists" });

    const [existingDisplay] = await pool.execute("SELECT user_id FROM users WHERE LOWER(display_name) = LOWER(?)", [cleanDisplayName]);
    if (existingDisplay.length > 0) return res.status(409).json({ message: "Display Name already taken" });

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    console.log(`[AUTH-REGISTER] Hashing password for email: ${normalizedEmail}`);

    const [result] = await pool.execute(
      `INSERT INTO users (full_name, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, 'student')`,
      [name.trim(), normalizedEmail, hashed, cleanDisplayName]
    );
    console.log(`[AUTH-REGISTER] User inserted with ID: ${result.insertId}`);

    const user = {
      userId: result.insertId,
      fullName: name.trim(),
      displayName: cleanDisplayName,
      email: normalizedEmail,
      role: "student"
    };

    req.session.user = user;

    res.status(201).json({ message: "Account created successfully", user });
  } catch (error) {
    console.error("AUTH ERROR:", error);
    res.status(500).json({ message: error.message || "Internal server error" });
  }
};

/* ================= LOGIN ================= */
const login = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    console.log(`[AUTH-LOGIN] Attempt for email: ${email}`);

    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

    const [rows] = await pool.execute(
      `SELECT user_id, full_name, display_name, email, password_hash, role, status FROM users WHERE email = ? LIMIT 1`,
      [email]
    );

    if (rows.length === 0) return res.status(401).json({ message: "Invalid credentials" });

    const userDb = rows[0];

    if (userDb.status === 'suspended') return res.status(403).json({ message: "Account suspended." });

    const match = await bcrypt.compare(password, userDb.password_hash);
    
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    const user = {
      userId: userDb.user_id,
      fullName: userDb.full_name,
      displayName: userDb.display_name,
      email: userDb.email,
      role: userDb.role
    };

    req.session.user = user;

    res.status(200).json({ message: "Login successful", user });
  } catch (error) {
    console.error("AUTH ERROR:", error);
    res.status(500).json({ message: error.message || "Internal server error" });
  }
};

/* ================= LOGOUT ================= */
const logout = async (req, res) => {
  if (!req.session) return res.json({ message: "Logged out" });

  req.session.destroy(() => {
    // Vercel handles cookies natively via the express-session middleware in server.js
    res.clearCookie('connect.sid'); // Fallback default name
    res.json({ message: "Logout successful" });
  });
};

/* ================= SESSION ================= */
const me = async (req, res) => {
  res.json({
    authenticated: !!req.session?.user,
    user: req.session?.user || null
  });
};

module.exports = { register, login, logout, me };
