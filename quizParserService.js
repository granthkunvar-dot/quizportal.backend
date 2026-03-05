/**
 * quizParserService.js
 * A pure, deterministic, side-effect-free utility for parsing bulk quiz text.
 * No database connections, no sessions, no external state.
 */

function parseQuizText(rawText, expectedQuestionCount = 15) {
    if (!rawText || typeof rawText !== 'string') {
        throw new Error('Invalid input: raw text is required.');
    }

    // Normalize newlines and trim
    const normalizedText = rawText.replace(/\r\n/g, '\n').trim();

    // Heuristically split based on question number markers (e.g. "1.", "1)", "1 .")
    // Needs to handle potentially missing lines between questions.
    // We look for start of line, digits, and a dot or paren.
    const questionBlocks = normalizedText.split(/^(?=\d+\s*[\.\)])/m).filter(block => block.trim().length > 0);

    if (questionBlocks.length !== expectedQuestionCount) {
        throw new Error(`Parsing Error: Expected exactly ${expectedQuestionCount} questions, but found ${questionBlocks.length}. Please check your numbering (e.g. "1.", "2.").`);
    }

    const parsedQuestions = questionBlocks.map((block, index) => {
        const questionNum = index + 1;
        const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        if (lines.length < 2) {
            throw new Error(`Question ${questionNum}: Malformed content. Could not identify question text and options.`);
        }

        // The first line should be the question text, starting with the number marker
        const firstLine = lines[0];
        const questionTextMatch = firstLine.match(/^\d+\s*[\.\)]\s*(.*)$/i);
        if (!questionTextMatch) {
            throw new Error(`Question ${questionNum}: Could not parse question text standard format.`);
        }

        let questionText = questionTextMatch[1].trim();

        // Check for difficulty tags inline
        let difficulty = 'medium';
        const diffMatch = questionText.match(/\[(easy|medium|hard)\]/i);
        if (diffMatch) {
            difficulty = diffMatch[1].toLowerCase();
            questionText = questionText.replace(diffMatch[0], '').trim();
        }

        let cognitiveLevel = 'understand'; // Default fallback

        // Extract options and correct answer
        const options = [];
        let explicitCorrectAnswer = null;
        let answerLineProcessed = false;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];

            // Check if it's the strict 'Answer: ' or 'Ans: ' line
            const ansMatch = line.match(/^(?:Answer|Ans):\s*([a-d])\b/i);
            if (ansMatch) {
                explicitCorrectAnswer = ansMatch[1].toUpperCase();
                answerLineProcessed = true;
                continue;
            }

            // Check if it's an option (e.g. "a.", "B)", "c .")
            const optMatch = line.match(/^([a-d])\s*[\.\)]\s*(.*)$/i);
            if (optMatch) {
                const optLetter = optMatch[1].toUpperCase();
                let optText = optMatch[2].trim();
                let isCorrect = false;

                // Check for inline correct markers like * or (correct)
                if (optText.endsWith('*')) {
                    isCorrect = true;
                    optText = optText.slice(0, -1).trim();
                } else if (optText.toLowerCase().endsWith('(correct)')) {
                    isCorrect = true;
                    optText = optText.substring(0, optText.length - 9).trim();
                }

                if (isCorrect) {
                    if (explicitCorrectAnswer && explicitCorrectAnswer !== optLetter) {
                        throw new Error(`Question ${questionNum}: Multiple conflicting correct answers detected.`);
                    }
                    explicitCorrectAnswer = optLetter;
                }

                options.push({
                    letter: optLetter,
                    text: optText
                });
            } else if (!answerLineProcessed) {
                // If it's not an option and not an answer line, it might be multi-line question text
                // Only append if we haven't started parsing options yet
                if (options.length === 0) {
                    questionText += ' ' + line;
                }
            }
        }

        if (options.length !== 4) {
            throw new Error(`Question ${questionNum}: Found ${options.length} options, expected exactly 4 (A, B, C, D).`);
        }

        // Validate options A, B, C, D exist
        const optionLetters = options.map(o => o.letter).sort().join('');
        if (optionLetters !== 'ABCD') {
            throw new Error(`Question ${questionNum}: Options must be labeled A, B, C, and D.`);
        }

        // Validate single correct answer
        if (!explicitCorrectAnswer) {
            throw new Error(`Question ${questionNum}: Missing correct answer. Use 'Ans: A' or mark with '*' or '(correct)'.`);
        }

        // Map correct flag to options
        let correctCount = 0;
        const mappedOptions = options.map(opt => {
            const isCorrect = (opt.letter === explicitCorrectAnswer);
            if (isCorrect) correctCount++;
            return {
                text: opt.text,
                is_correct: isCorrect,
                order_index: opt.letter.charCodeAt(0) - 64 // A=1, B=2, C=3...
            };
        });

        if (correctCount !== 1) {
            throw new Error(`Question ${questionNum}: Found ${correctCount} correct answers. Expected exactly 1.`);
        }

        return {
            question_text: questionText,
            question_type: 'multiple_choice', // All heuristic parsed are MCQ
            difficulty,
            cognitive_level: cognitiveLevel,
            points: difficulty === 'hard' ? 15.00 : difficulty === 'easy' ? 5.00 : 10.00,
            options: mappedOptions
        };
    });

    return parsedQuestions;
}

module.exports = {
    parseQuizText
};
