async function testAuth() {
    try {
        const res = await fetch('http://localhost:5000/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: "Final Test 9",
                displayName: "finaltest9",
                email: "finaltest9@test.com",
                password: "password123"
            })
        });
        const data = await res.json();
        console.log("Status:", res.status);
        console.log("Data:", data);

        // Let's also test Login immediately
        const loginRes = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: "finaltest9@test.com",
                password: "password123"
            })
        });
        const loginData = await loginRes.json();
        const loginHeaders = loginRes.headers.get('set-cookie');

        console.log("Login Status:", loginRes.status);
        console.log("Login Data:", loginData);
        console.log("Set-Cookie:", loginHeaders);

    } catch (err) {
        console.log("Error:", err);
    }
}
testAuth();
