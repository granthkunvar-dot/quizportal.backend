const { parseQuizText } = require('./src/services/quizParserService');

function runTests() {
    console.log("--- Starting quizParserService Unit Tests ---");
    let passed = 0;
    let failed = 0;

    const assertThrows = (testName, input, expectedErrorStr) => {
        try {
            parseQuizText(input, 3); // Testing with 3 instead of 15 for brevity
            console.error(`❌ ${testName} failed: Expected error but it parsed successfully.`);
            failed++;
        } catch (e) {
            if (e.message.includes(expectedErrorStr)) {
                console.log(`✅ ${testName} passed.`);
                passed++;
            } else {
                console.error(`❌ ${testName} failed: Error mismatch. Expected "${expectedErrorStr}", got "${e.message}"`);
                failed++;
            }
        }
    }

    const assertSuccess = (testName, input, expectedCount) => {
        try {
            const res = parseQuizText(input, expectedCount);
            if (res.length === expectedCount) {
                console.log(`✅ ${testName} passed. Parsed ${expectedCount} questions.`);
                passed++;
            } else {
                console.error(`❌ ${testName} failed: Parsed ${res.length} instead of ${expectedCount}.`);
                failed++;
            }
        } catch (e) {
            console.error(`❌ ${testName} failed with error: ${e.message}`);
            failed++;
        }
    }

    // 1. Clean valid input
    const validClean = `
1. What is React? [easy]
a. library
b. framework
c. language
d. database
Ans: A

2. State management tool?
A) Redux (correct)
B) Express
C) MySQL
D) MongoDB

3. What is Node?
a) Browser
b) Runtime *
c) OS
d) Editor
`;
    assertSuccess("Valid Clean Format", validClean, 3);

    // 2. Missing correct answer
    const missingAns = `
1. Test missing ans
A) One
B) Two
C) Three
D) Four

2. Normal Q
a) A
b) B
c) C
d) D *

3. Normal Q2
a) A
b) B
c) C
d) D *
`;
    assertThrows("Missing Correct Answer", missingAns, "Question 1: Missing correct answer");

    // 3. Double correct answer
    const doubleAns = `
1. The double
a) A *
b) B
c) C (correct)
d) D

2. Normal Q
a) A
b) B
c) C
d) D *

3. Normal Q2
a) A
b) B
c) C
d) D *
`;
    assertThrows("Double Correct Mark", doubleAns, "Question 1: Multiple conflicting correct answers detected");

    // 4. Missing options (less than 4)
    const missingOpt = `
1. Less options
a) One
b) Two
c) Three
Ans: a

2. Normal Q
a) A
b) B
c) C
d) D *

3. Normal Q2
a) A
b) B
c) C
d) D *
`;
    assertThrows("Less than 4 options", missingOpt, "Question 1: Found 3 options, expected exactly 4");

    // 5. Wrong Question Count
    const wrongCount = `
1. Q1
a) A b) B c) C d) D *
`;
    assertThrows("Incorrect Total Questions", wrongCount, "Expected exactly 3 questions, but found 1");

    console.log(`\n--- Test Summary: ${passed} Passed, ${failed} Failed ---`);
    if (failed > 0) process.exit(1);
}

runTests();
