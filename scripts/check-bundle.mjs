// 첫 화면 JS 크기 검사 — ADR 2026-10-29-app-shell 11절. 게임 앱을 빌드한 뒤 dist를 본다(CI 빌드 단계 다음).
// 첫 화면 JS = 빌드한 index.html이 부르는 모듈(<script type="module" src>)과 미리 받는 조각(<link rel="modulepreload">).
// 파일마다 gzip 9단계로 줄인 크기를 더해 상한(apps/game/bundle-budget.json)과 비교한다. 상한은 그 파일 한 곳에만 둔다.
// - 모듈이 아닌 스크립트(theme-init.js)와 지연 로딩 조각은 넣지 않는다(정의가 "모듈 + modulepreload"다).
// - gzip은 Node 내장 zlib(level 9)이다. GNU gzip -9와는 몇백 바이트 다르다
//   (main 507e645: zlib 114,171 B, gzip -9 113,744 B. 앞 작업 기록의 113,744 B는 gzip -9로 잰 값이다).
// 사용: node scripts/check-bundle.mjs [dist 폴더] [--budget 상한 파일]  (기본: apps/game/dist, apps/game/bundle-budget.json)
// 상한을 넘거나 빌드 결과가 이상하면 코드 1. 순수 함수는 시험(check-bundle.test.mjs)이 바로 부른다.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { fail } from "./lib.mjs";

/** 상한 파일에서 읽는 칸(바이트, 양의 정수) */
export const BUDGET_KEY = "firstScreenJsGzipBytes";
/** gzip 단계 — ADR 11절 "파일마다 gzip 9단계" */
export const GZIP_LEVEL = 9;
const DEFAULT_DIST = "apps/game/dist";
const DEFAULT_BUDGET = "apps/game/bundle-budget.json";

/** 1234567 → "1,234,567" */
const bytes = (value) => value.toLocaleString("en-US");

/** HTML 주석을 뺀다(주석 안의 태그 모양 글자를 읽지 않게) */
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, "");

/** <script>·<link> 태그의 속성들을 문서 차례대로 (빌드된 index.html 정도만 다룬다) */
function scriptAndLinkTags(html) {
  return [...stripComments(html).matchAll(/<(script|link)\b([^>]*)>/gi)].map((match) => {
    const attributes = {};
    for (const attr of match[2].matchAll(/([\w-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attributes[attr[1].toLowerCase()] = attr[3] ?? attr[4] ?? attr[5] ?? "";
    }
    return { name: match[1].toLowerCase(), attributes };
  });
}

/** 첫 화면이 받는 JS 주소들: 모듈 스크립트 + modulepreload. 문서 차례대로, 같은 주소는 한 번 */
export function firstScreenScripts(indexHtml) {
  const found = [];
  for (const { name, attributes } of scriptAndLinkTags(indexHtml)) {
    if (name === "script" && attributes.type?.trim().toLowerCase() === "module" && attributes.src) {
      found.push(attributes.src);
    }
    const rel = (attributes.rel ?? "").toLowerCase().split(/\s+/);
    if (name === "link" && rel.includes("modulepreload") && attributes.href) found.push(attributes.href);
  }
  return [...new Set(found)];
}

/** 사이트 안 주소 → dist 안 경로("/assets/a.js" → "assets/a.js"). 다른 출처면 null */
function localPath(href) {
  const url = new URL(href, "https://app.invalid/");
  return url.origin === "https://app.invalid" ? decodeURIComponent(url.pathname).replace(/^\/+/, "") : null;
}

/**
 * 첫 화면 JS를 잰다. readFile(dist 기준 경로) → 바이트(없으면 null).
 * 돌려주는 것: 파일마다 { path, bytes, gzipBytes }, 합, 문제 목록(빠진 파일, 다른 출처, 모듈 스크립트 없음)
 */
export function measureFirstScreen({ indexHtml, readFile }) {
  const problems = [];
  const files = [];
  const scripts = firstScreenScripts(indexHtml);
  if (scripts.length === 0) {
    problems.push(
      'index.html에 모듈 스크립트(<script type="module" src>)가 없습니다. 빌드 결과가 맞는지 보세요.',
    );
  }
  for (const src of scripts) {
    const local = localPath(src);
    if (local === null) {
      problems.push(`다른 출처의 스크립트는 잴 수 없습니다: ${src}`);
      continue;
    }
    const content = readFile(local);
    if (!content) {
      problems.push(`index.html이 부르는 파일이 빌드 결과에 없습니다: ${src}`);
      continue;
    }
    files.push({
      path: local,
      bytes: content.length,
      gzipBytes: gzipSync(content, { level: GZIP_LEVEL }).length,
    });
  }
  return {
    files,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    totalGzipBytes: files.reduce((sum, file) => sum + file.gzipBytes, 0),
    problems,
  };
}

/** 상한 파일 내용 → { limit } 또는 { problem } */
export function parseBudget(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { problem: "JSON으로 읽을 수 없습니다." };
  }
  const limit = data !== null && typeof data === "object" ? data[BUDGET_KEY] : undefined;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    return { problem: `"${BUDGET_KEY}"가 양의 정수(바이트)가 아닙니다.` };
  }
  return { limit };
}

/** 상한과 비교한다. 넘으면 문제 한 줄(같으면 통과) */
export function checkBudget(measured, limit) {
  const total = measured.totalGzipBytes;
  if (total <= limit) return [];
  return [
    `첫 화면 JS가 상한을 넘었습니다: ${bytes(total)} B > ${bytes(limit)} B (+${bytes(total - limit)} B, gzip ${GZIP_LEVEL}단계). ` +
      `줄이거나, 늘어난 까닭과 잰 값을 작업 기록에 적고 상한을 올립니다(ADR 2026-10-29-app-shell 11절).`,
  ];
}

/** 결과 표(맨 앞 줄이 요약) */
export function formatReport(measured, limit) {
  const headroom = limit - measured.totalGzipBytes;
  const mark = headroom >= 0 ? "✓" : "✗";
  const lines = [
    `${mark} 첫 화면 JS ${bytes(measured.totalGzipBytes)} B (gzip ${GZIP_LEVEL}단계, 파일 ${measured.files.length}개, ` +
      `원본 ${bytes(measured.totalBytes)} B) / 상한 ${bytes(limit)} B (${headroom >= 0 ? "남음" : "넘음"} ${bytes(Math.abs(headroom))} B)`,
  ];
  for (const file of measured.files) {
    lines.push(`  ${file.path}  ${bytes(file.bytes)} B → ${bytes(file.gzipBytes)} B`);
  }
  return lines;
}

/** 보여 줄 경로: 지금 폴더 안이면 상대 경로, 밖이면 절대 경로 */
function shown(file) {
  const relative = path.relative(process.cwd(), file);
  return relative.startsWith("..") || path.isAbsolute(relative) ? file : relative || ".";
}

/** 명령줄: 빌드 결과와 상한 파일을 읽어 검사한다 */
function main() {
  let args;
  try {
    args = parseArgs({ allowPositionals: true, options: { budget: { type: "string" } } });
  } catch (error) {
    fail([`${error.message}. 사용: node scripts/check-bundle.mjs [dist 폴더] [--budget 상한 파일]`]);
  }
  const dist = path.resolve(args.positionals[0] ?? DEFAULT_DIST);
  const budgetFile = path.resolve(args.values.budget ?? DEFAULT_BUDGET);
  const indexFile = path.join(dist, "index.html");
  if (!existsSync(indexFile)) {
    fail([
      `${dist}에 빌드 결과가 없습니다. 먼저 pnpm build(또는 pnpm --filter @terra/game build)를 실행하세요.`,
    ]);
  }
  if (!existsSync(budgetFile)) fail([`상한 파일이 없습니다: ${budgetFile}`]);
  const budget = parseBudget(readFileSync(budgetFile, "utf8"));
  if (budget.problem) fail([`${shown(budgetFile)}: ${budget.problem}`]);

  const measured = measureFirstScreen({
    indexHtml: readFileSync(indexFile, "utf8"),
    readFile: (relative) => {
      const full = path.resolve(dist, relative);
      // dist 밖은 읽지 않는다
      if (!full.startsWith(dist + path.sep) || !existsSync(full) || !statSync(full).isFile()) return null;
      return readFileSync(full);
    },
  });
  if (measured.problems.length > 0) fail(measured.problems);
  const report = formatReport(measured, budget.limit);
  const problems = checkBudget(measured, budget.limit);
  console.log(`${report.join("\n")}\n  (빌드 ${shown(dist)}, 상한 ${shown(budgetFile)})`);
  if (problems.length > 0) fail(problems);
}

if (import.meta.main) main();
