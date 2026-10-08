import { topics } from "./course";
import { createProgress, settleRun, startRun, submitAnswer, validateProgress } from "./progress";

/** Isolated QA session; its rewards never enter the child's localStorage archive. */
export function createDemoProgress(now = Date.now()) {
  let progress = createProgress();
  const base = now - 3 * 86400000;
  for (const topic of topics) {
    for (let order = 1; order <= 6; order++) {
      const time = base + (order === 6 ? 86400000 : order * 10000);
      progress = startRun(progress, `${topic.id}-${order}`, time);
      while (progress.activeRun && progress.activeRun.index < 6) {
        const exercise = progress.activeRun.exercises[progress.activeRun.index];
        progress = submitAnswer(progress, exercise.answer, time + progress.activeRun.index * 1000).progress;
      }
      progress = settleRun(progress, time + 7000);
    }
  }
  return validateProgress(progress);
}
