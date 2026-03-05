const mysql = require('mysql2/promise');

async function runTests() {
    const db = await mysql.createConnection({
        host: 'localhost', user: 'root', password: '', database: 'quiz_portal_db'
    });

    try {
        // 1. Get current row counts
        const [quizRowsBefore] = await db.execute('SELECT COUNT(*) as c FROM quizzes');
        const [qRowsBefore] = await db.execute('SELECT COUNT(*) as c FROM questions');

        console.log(`Before Publish - Quizzes: ${quizRowsBefore[0].c}, Questions: ${qRowsBefore[0].c}`);

        // 2. Login as admin
        const loginRes = await fetch('http://localhost:5000/api/auth/login', {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: 'granth@test.com', password: 'granth123' })
        });
        const loginData = await loginRes.json();
        const token = loginData.token;

        // 3. Attempt publish with a mock payload
        const rawText = `1) What is React?\na. library\nb.framework\nc) language\nd) db\nAns:a`;

        let publishError = null;
        try {
            const pubRes = await fetch('http://localhost:5000/api/admin/quizzes/bulk-publish', {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({
                    title: 'Transaction Test Quiz',
                    category: 'main',
                    expectedCount: 1,
                    rawText: rawText
                })
            });
            if (!pubRes.ok) throw new Error(await pubRes.text());
        } catch (err) {
            publishError = err.message;
        }

        console.log("Publish result (expected error due to broke query):", publishError);

        // 4. Get after row counts
        const [quizRowsAfter] = await db.execute('SELECT COUNT(*) as c FROM quizzes');
        const [qRowsAfter] = await db.execute('SELECT COUNT(*) as c FROM questions');

        console.log(`After Publish - Quizzes: ${quizRowsAfter[0].c}, Questions: ${qRowsAfter[0].c}`);

        if (quizRowsBefore[0].c === quizRowsAfter[0].c && qRowsBefore[0].c === qRowsAfter[0].c) {
            console.log("========================================");
            console.log("TRANSACTION TEST PASSED: No partial data inserted.");
            console.log("========================================");
        } else {
            console.log("========================================");
            console.log("TRANSACTION TEST FAILED: Partial data inserted!");
            console.log("========================================");
        }

    } catch (err) {
        console.error("Test execution failed:", err);
    } finally {
        await db.end();
    }
}
runTests();
