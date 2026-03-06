const mysql = require("mysql2/promise");

// We removed the require("./env") line because we use Vercel Environment Variables now
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 22282, // Defaulted to your Aiven port
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false // Required for Aiven MySQL SSL connections
  }
});

const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log("Database connected successfully to Aiven!");
    connection.release();
  } catch (err) {
    console.error("Database connection failed:", err.message);
  }
};

module.exports = {
  pool,
  testConnection
};
