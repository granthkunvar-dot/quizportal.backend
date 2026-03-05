const { pool } = require('./src/config/db');

async function query() {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute('SELECT user_id, email, role, status FROM users');
    console.log(rows);
    connection.release();
    process.exit(0);
}
query();
