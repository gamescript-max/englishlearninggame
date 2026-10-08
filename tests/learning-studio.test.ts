import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LearningStudio } from "../components/learning-studio";
import { LearningSceneArt } from "../components/learning-art";
import { createProgress } from "../lib/progress";

function renderStudio(initialUnit: string) {
  const progress = createProgress();
  return renderToStaticMarkup(createElement(LearningStudio, {
    progress, initialUnit, commit: () => progress, onBack: () => {},
  }));
}

test("opening the daily-life destination enters its four learning stations", () => {
  const html = renderStudio("daily");
  assert.match(html, /日常时光站/);
  for (const station of ["听音找朋友", "字卡探险", "单词工坊", "我来告诉你"]) assert.ok(html.includes(station));
  assert.ok(!html.includes("今天的 10–15 分钟小冒险"), "daily is a curriculum destination, not the general hub");
});

test("the diagnostic opens with adult instructions before creating a session or showing answer models", () => {
  const html = renderStudio("a1-readiness");
  assert.match(html, /开始观察/);
  assert.match(html, /回答前不显示英文原文或中文翻译/);
  assert.match(html, /不是官方 A1 认证/);
  assert.ok(!html.includes("The boy is reading a book."));
  assert.ok(!html.includes("成人观察：独立完成"));
  assert.ok(!html.includes("learning-option"), "no live questions should appear before the adult starts");
});

test("a positioned scene depicts the requested number of books", () => {
  const html = renderToStaticMarkup(createElement(LearningSceneArt, {
    scene: { objects: [{ wordId: "book", count: 2, position: "on" }, { wordId: "desk" }] },
  }));
  assert.equal((html.match(/aria-label="书"/g) ?? []).length, 2);
  assert.equal((html.match(/aria-label="课桌"/g) ?? []).length, 1);
});
