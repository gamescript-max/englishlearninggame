import { hydrateRoot } from "react-dom/client";
import GameApp from "@/components/game-app";
import "@/app/globals.css";

const container = document.getElementById("root");
if (!container) throw new Error("找不到英语探索岛的页面入口。");
hydrateRoot(container, <GameApp />);
