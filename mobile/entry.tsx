import { createRoot } from "react-dom/client";
import GameApp from "@/components/game-app";
import "@/app/globals.css";
import "./native.css";

const container = document.getElementById("root");
if (!container) throw new Error("找不到英语探索岛的页面入口。");
createRoot(container).render(<GameApp />);
