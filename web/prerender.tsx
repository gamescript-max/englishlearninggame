import { renderToString } from "react-dom/server";
import GameApp from "@/components/game-app";

// Only the initial, empty learning profile is rendered. Device records and
// microphone data are never part of the deployment or search-visible HTML.
export function renderGame() {
  return renderToString(<GameApp />);
}
