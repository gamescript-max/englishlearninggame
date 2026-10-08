import type { Metadata, Viewport } from "next";
import "./globals.css";
import { gameImageURL } from "@/lib/game-image-assets";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export const metadata: Metadata = {
  title: "萌宠英语探索岛 · 和乐乐一起学英语",
  description: "给6–9岁孩子的英语小冒险：听音找物、跟读、照顾伙伴，从启蒙迈向Pre-A1和A1。",
  appleWebApp: { capable: true, title: "英语探索岛", statusBarStyle: "default" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head><link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials"/>{["archipelago-ocean-v1", "destination-islands-v1", "fox"].map(name => <link key={name} rel="preload" as="image" href={gameImageURL(`/images/${name}.png`)} fetchPriority="high"/>)}</head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
