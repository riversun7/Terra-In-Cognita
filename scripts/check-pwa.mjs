// PWA 빌드 결과 검사 — 게임 앱을 빌드한 뒤 dist를 본다(CI 빌드 단계 다음). 규칙은 pwa-build.mjs
// 빌드된 sw.js의 화면 이동 대체 제외 목록(denylist)에 화면 주소 표의 모든 경로 예를 대 본다(ADR 2026-10-29-app-shell 1절)
// 사용: node scripts/check-pwa.mjs [dist 폴더]  (기본: apps/game/dist)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fail } from "./lib.mjs";
import { ROUTE_NAVIGATIONS, findPwaProblems } from "./pwa-build.mjs";

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
// dist의 모든 파일(dist 기준, / 구분). 소스 맵은 뺀다
const files = readdirSync(dist, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && !entry.name.endsWith(".map"))
  .map((entry) => path.relative(dist, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"));

const problems = findPwaProblems({
  indexHtml: readText("index.html"),
  manifest: readText("manifest.webmanifest"),
  sw: readText("sw.js"),
  readFile,
  files,
});
if (problems.length > 0) fail(problems);
const fonts = files.filter((file) => file.endsWith(".woff2")).length;
console.log(
  `✓ PWA 빌드 결과 통과 — manifest·아이콘·sw.js(화면 주소 경로 예 ${ROUTE_NAVIGATIONS.length}개를 index.html로 엶)·theme-init.js·글꼴 ${fonts}개(WOFF2, 미리 캐시 안 함) (${path.relative(process.cwd(), dist) || "."})`,
);
