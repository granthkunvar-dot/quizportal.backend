const axios = require('axios');

const API = "http://localhost:5000/api";

const cookies = {};
const getCookieString = (userId) => cookies[userId] || '';

const client = (userId) => {
    return axios.create({
        baseURL: API,
        headers: { Cookie: getCookieString(userId) },
        validateStatus: () => true
    });
};

const storeCookies = (userId, response) => {
    const rawCookies = response.headers['set-cookie'];
    if (rawCookies) {
        cookies[userId] = rawCookies.map(c => c.split(';')[0]).join('; ');
    }
};

async function runTests() {
    console.log("=== STARTING ADMIN & PRESTIGE INTEGRATION TESTS ===\\n");

    try {
        let adminClient = client('admin');
        let studentClient = client('student');

        console.log("1. Authenticating Super Admin & Student...");
        let resAdmin = await adminClient.post('/auth/login', { email: 'granth@test.com', password: 'password123' });
        storeCookies('admin', resAdmin);
        console.log(` Admin Login: ${resAdmin.status} - ${resAdmin.data.message || 'OK'}`);

        let resStudent = await studentClient.post('/auth/login', { email: 'grant@test.com', password: 'password123' });
        storeCookies('student', resStudent);
        console.log(` Student Login: ${resStudent.status} - ${resStudent.data.message || 'OK'}`);
        console.log("---");

        adminClient = client('admin');
        studentClient = client('student');

        console.log("2. Testing Admin Governance Protection...");
        let resAdminUsers = await adminClient.get('/admin/users');
        console.log(` [Admin] Fetch Users: ${resAdminUsers.status} - Found ${resAdminUsers.data?.users?.length} users`);

        let resStudentAdmin = await studentClient.get('/admin/users');
        console.log(` [Student] Fetch Users (Should Fail): ${resStudentAdmin.status}`);

        console.log("\\n3. Testing Gameplay Separation...");
        let resQuizzesAdmin = await adminClient.get('/student/quizzes');
        console.log(` [Admin] View Quizzes (Should Fail): ${resQuizzesAdmin.status} - ${resQuizzesAdmin.data.message}`);

        console.log("\\n4. Testing Prestige Live Dashboard...");
        let resLiveStats = await studentClient.get('/student/dashboard/live-stats');
        console.log(` [Student] Live Dashboard Data: ${resLiveStats.status}`);
        console.log(JSON.stringify(resLiveStats.data, null, 2));

    } catch (err) {
        console.error("TEST FATAL ERROR:", err.message);
    }
}

runTests();
