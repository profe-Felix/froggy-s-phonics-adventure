export function summarizeListeningAttempts(attempts = []) {
  const seen = new Set();
  let correct = 0, wrong = 0, firstTryCorrect = 0;
  for (const attempt of attempts) {
    const key = `${attempt.problemIndex || 0}:${attempt.word}`;
    if (attempt.correct) {
      correct++;
      if (!seen.has(key)) firstTryCorrect++;
    } else wrong++;
    seen.add(key);
  }
  return { correct, wrong, firstTryCorrect, mistakes: wrong, total: correct };
}
