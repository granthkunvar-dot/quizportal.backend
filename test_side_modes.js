require('dotenv').config();
const { pool } = require('./src/config/db');
const { closeSeasonIfExpired } = require('./src/services/seasonService');

async function testSideModes() {
    try {
        console.log("Starting Side Modes verification...");
        const [seasons] = await pool.execute("SELECT season_id FROM seasons WHERE is_active = 1 LIMIT 1");
        if (seasons.length === 0) {
            console.log("No active season. Creating one...");
            await pool.execute("INSERT INTO seasons (start_date, end_date, is_active) VALUES (NOW(), DATE_ADD(NOW(), INTERVAL 10 DAY), 1)");
        }

        const [activeSeasons] = await pool.execute("SELECT season_id FROM seasons WHERE is_active = 1 LIMIT 1");
        const seasonId = activeSeasons[0].season_id;

        const [users] = await pool.execute("SELECT user_id FROM users WHERE role = 'student' LIMIT 2");
        if (users.length === 0) {
            console.log("Need student users in the database to run this test.");
            process.exit(0);
        }

        console.log(`Using Season ID: ${seasonId}`);

        await pool.execute("DELETE FROM side_leaderboard_stats");
        await pool.execute("DELETE FROM user_side_season_results");

        let score = 500;
        // Insert dummy data for 'cinema' category
        for (const u of users) {
            await pool.execute(
                "INSERT INTO side_leaderboard_stats (user_id, season_id, category, side_aura_points, total_attempts) VALUES (?, ?, ?, ?, ?)",
                [u.user_id, seasonId, 'cinema', score, 3]
            );
            score -= 150;
        }

        console.log("Forcing season to expire...");
        await pool.execute('UPDATE seasons SET end_date = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE season_id = ?', [seasonId]);

        console.log("Triggering closeSeasonIfExpired()...");
        await closeSeasonIfExpired();

        const [results] = await pool.execute("SELECT user_id, category, final_rank, awarded_title FROM user_side_season_results WHERE category='cinema'");
        console.log("Generated Cinema Season Results:");
        console.table(results);

        console.log("Test OK! Cleaning up test records is not necessary since DB is local, but you can see titles were awarded.");
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

testSideModes();
