// PWA 빌드 결과 검사 — 게임 앱을 빌드한 뒤 dist를 본다(CI 빌드 단계 다음). 규칙은 pwa-build.mjs
// 사용: node scripts/check-pwa.mjs [dist 폴더]  (기본: apps/game/dist)
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fail } from "./lib.mjs";
import { findPwaProblems } from "./pwa-build.mjs";

const dist = path.resolve(process.argv[2] ?? "apps/game/dist");
if (!existsSync(path.join(dist, "index.html"))) {
  fail([`${dist}에 빌드 결과가 없습니다. 먼저 pnpm --filter @terra/game build를 실행하세요.`]);
}

const readFile = (relative) => {
  const full = path.resolve(dist, relative);
  // dist 밖은 읽지 않는다
  if (!full.startsWith(dist + path.sep) || !existsSync(full) || !statSync(full).isFile()) return null;
  return readFileSync(full);
};
const readText = (relative) => readFile(relative)?.toString("utf8") ?? null;

const problems = findPwaProblems({
  indexHtml: readText("index.html"),
  manifest: readText("manifest.webmanifest"),
  sw: readText("sw.js"),
  readFile,
});
if (problems.length > 0) fail(problems);
console.log(`✓ PWA 빌드 결과 통과 — manifest·아이콘·sw.js (${path.relative(process.cwd(), dist) || "."})`);
