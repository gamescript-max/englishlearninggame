import type { PlaygroundMode, PlaygroundTaskByMode } from "@/lib/playground-content";
import type { PlaygroundModeState } from "@/lib/playground-progress";
export interface PlaygroundGameProps<M extends PlaygroundMode = PlaygroundMode> {
  task: PlaygroundTaskByMode[M]; state: PlaygroundModeState; hinted: boolean; disabled: boolean;
  onAnswer: (answer: string, taskId?: string) => void; onInteract: () => void;
}
