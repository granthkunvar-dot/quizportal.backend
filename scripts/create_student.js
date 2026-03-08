const bcrypt = require('bcrypt');
const pool = require('./src/config/db');

async function createStudent() {
    try {
        const hash = await bcrypt.hash('password123', 10);
        const conn = await pool.getConnection();
        await conn.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES ('Test Student', 'grant@test.com', ?, 'student')", [hash]);
        console.log("Successfully created grant@test.com with password123");
    } catch (err) {
        console.error("Failed to seed user:", err.message);
    } finally {
        process.exit(0);
    }
}
createStudent();

