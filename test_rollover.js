const { pool } = require("./src/config/db");
const { closeSeasonIfExpired } = require("./src/services/seasonService");

async function runTests() {
    console.log("--- Starting Dual Aura Verification Tests ---");
    let connection;

    try {
        connection = await pool.getConnection();

        // 1. CLEAR EXISTING DATA FOR CLEAN TEST
        await connection.execute("SET FOREIGN_KEY_CHECKS = 0;");
        await connection.execute("TRUNCATE TABLE user_season_results;");
        await connection.execute("TRUNCATE TABLE leaderboard_stats;");
        await connection.execute("TRUNCATE TABLE seasons;");
        await connection.execute(`
            DELETE FROM users WHERE email LIKE 'testuser_%';
        `);
        await connection.execute("SET FOREIGN_KEY_CHECKS = 1;");

        console.log("[+] Database cleared for testing.");

        // 2. CREATE MOCK USERS
        const mockUsers = [
            { id: null, email: 'testuser_1@test.com', name: 'User 1' },
            { id: null, email: 'testuser_2@test.com', name: 'User 2' },
            { id: null, email: 'testuser_3@test.com', name: 'User 3' },
            { id: null, email: 'testuser_4@test.com', name: 'User 4' },
            { id: null, email: 'testuser_5@test.com', name: 'User 5' },
            { id: null, email: 'testuser_6@test.com', name: 'User 6' },
        ];

        for (let i = 0; i < mockUsers.length; i++) {
            const [result] = await connection.execute(
                `INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, 'hash', 'student')`,
                [mockUsers[i].name, mockUsers[i].email]
            );
            mockUsers[i].id = result.insertId;
        }

        console.log("[+] Mock users created.");

        // 3. CREATE MOCK EXPIRED SEASON
        const pastDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
        const expiredEndDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

        const [seasonResult] = await connection.execute(
            `INSERT INTO seasons (start_date, end_date, is_active, is_closed) VALUES (?, ?, 1, 0)`,
            [pastDate, expiredEndDate]
        );
        const activeSeasonId = seasonResult.insertId;

        console.log(`[+] Mock expired season created (ID: ${activeSeasonId}).`);

        // 4. MOCK LEADERBOARD DATA (TESTING TIE BREAKS)
        // Rule: aura_points DESC, total_attempts ASC, stat_id ASC
        const stats = [
            { userId: mockUsers[0].id, aura: 5000, attempts: 10 }, // Rank 1
            { userId: mockUsers[1].id, aura: 4000, attempts: 5 },  // Rank 2 (Tie on aura, wins on attempts)
            { userId: mockUsers[2].id, aura: 4000, attempts: 8 },  // Rank 3 (Loses tie break on attempts)
            { userId: mockUsers[3].id, aura: 3000, attempts: 2 },  // Rank 4 (Tie on aura, tie on attempts, wins stat_id)
            { userId: mockUsers[4].id, aura: 3000, attempts: 2 },  // Rank 5 (Loses stat_id tie break to User 4)
            // User 6 does not participate
        ];

        for (const stat of stats) {
            await connection.execute(
                `INSERT INTO leaderboard_stats (user_id, season_id, aura_points, total_possible_weighted_points, total_attempts)
                VALUES (?, ?, ?, 5000, ?)`,
                [stat.userId, activeSeasonId, stat.aura, stat.attempts]
            );
        }

        console.log("[+] Mock stats inserted. Ready for rank evaluation.");

        // 5. RUN SERVICE TO CLOSE TICK
        await closeSeasonIfExpired();
        console.log("[+] closeSeasonIfExpired() ran successfully.");

        // 6. VALIDATE RESULTS
        const [results] = await connection.execute(
            `SELECT user_id, final_rank, total_participants, season_aura, participation_status, awarded_title 
             FROM user_season_results WHERE season_id = ? ORDER BY final_rank ASC`,
            [activeSeasonId]
        );

        console.log("\n--- Rollover Results ---");
        let testsPassed = true;

        const checkRank = (userId, expectedRank, expectedTitle) => {
            const row = results.find(r => r.user_id === userId);
            const pass = row && row.final_rank === expectedRank && row.awarded_title === expectedTitle;
            console.log(`User ${userId} | Expected Rank: ${expectedRank} Title: ${expectedTitle} | Actual Rank: ${row?.final_rank} Title: ${row?.awarded_title} | ${pass ? '✅' : '❌'}`);
            if (!pass) testsPassed = false;
        };

        checkRank(mockUsers[0].id, 1, "Aura Farmer");
        checkRank(mockUsers[1].id, 2, "IQ Monster");
        checkRank(mockUsers[2].id, 3, "RizzGod");
        checkRank(mockUsers[3].id, 4, "The Warlord");
        checkRank(mockUsers[4].id, 5, "System Slayer");

        const absentRow = results.find(r => r.user_id === mockUsers[5].id);
        const absentPass = absentRow && absentRow.final_rank === null && absentRow.participation_status === 'absent';
        console.log(`User ${mockUsers[5].id} (Absent) | Expected: null/absent | Actual: ${absentRow?.final_rank}/${absentRow?.participation_status} | ${absentPass ? '✅' : '❌'}`);
        if (!absentPass) testsPassed = false;

        const [newSeasonRows] = await connection.execute(`SELECT * FROM seasons WHERE is_active = 1`);
        const seasonPass = newSeasonRows.length === 1 && newSeasonRows[0].season_id !== activeSeasonId;
        console.log(`New Season Created | ${seasonPass ? '✅' : '❌'}`);
        if (!seasonPass) testsPassed = false;

        if (testsPassed) {
            console.log("\n✅ ALL TIE-BREAK AND ROLLOVER TESTS PASSED.");
        } else {
            console.error("\n❌ SOME TESTS FAILED.");
        }

    } catch (err) {
        console.error("Test Error:", err);
    } finally {
        if (connection) connection.release();
        process.exit(0);
    }
}

runTests();
