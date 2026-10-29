// 첫 화면 JS 크기 검사 시험 — 실제 빌드(Vite 8.3.5 + vite-plugin-pwa 2.0.0)와 같은 모양의 가짜 index.html로 본다.
// 명령줄은 임시 폴더의 가짜 빌드 결과에 실제로 돌려 종료 코드를 본다(상한을 낮추면 실패해야 한다).
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BUDGET_KEY,
  checkBudget,
  firstScreenScripts,
  formatReport,
  measureFirstScreen,
  parseBudget,
} from "./check-bundle.mjs";

const SCRIPT = fileURLToPath(new URL("./check-bundle.mjs", import.meta.url));
const REPO_BUDGET = fileURLToPath(new URL("../apps/game/bundle-budget.json", import.meta.url));

// main 507e645 빌드의 index.html과 같은 모양(주석·테마 시작 스크립트·아이콘·CSS·manifest 포함)
const INDEX_HTML = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <!-- 주소창 색. <script type="module" src="/assets/comment.js"></script> 주석 안의 태그는 읽지 않는다 -->
    <meta name="theme-color" content="#dff2fb" />
    <script src="/theme-init.js"></script>
    <link rel="icon" href="/favicon.ico" sizes="32x32" />
    <title>Terra In-Cognita</title>
    <script type="module" crossorigin src="/assets/index-B7fuako4.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/json-ChvLVnqC.js">
    <link rel="modulepreload" crossorigin href="/assets/reporter-B1GdZV1c.js">
    <link rel="stylesheet" crossorigin href="/assets/index-ph9ctDH6.css">
  <link rel="manifest" href="/manifest.webmanifest"></head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

/** 내용이 다른 가짜 JS(되풀이가 있어 gzip이 줄인다) */
const js = (name, repeat) => new TextEncoder().encode(`export const ${name}="${"abc".repeat(repeat)}";\n`);

const FILES = {
  "assets/index-B7fuako4.js": js("index", 4000),
  "assets/json-ChvLVnqC.js": js("json", 50),
  "assets/reporter-B1GdZV1c.js": js("reporter", 900),
  "theme-init.js": js("themeInit", 300),
  "assets/index-ph9ctDH6.css": new TextEncoder().encode("body{margin:0}"),
};
const readFile = (relative) => FILES[relative] ?? null;
const gzip9 = (bytes) => gzipSync(bytes, { level: 9 }).length;

describe("firstScreenScripts", () => {
  it("모듈 스크립트와 modulepreload를 문서 차례대로 고르고, 나머지 태그와 주석은 뺀다", () => {
    expect(firstScreenScripts(INDEX_HTML)).toEqual([
      "/assets/index-B7fuako4.js",
      "/assets/json-ChvLVnqC.js",
      "/assets/reporter-B1GdZV1c.js",
    ]);
  });

  it("속성 차례·따옴표·대소문자가 달라도 읽고, 같은 주소는 한 번만", () => {
    const html = `<SCRIPT src='/a.js' TYPE=" Module "></SCRIPT>
      <link href=/b.js rel="preload modulepreload">
      <link rel="modulepreload" href="/a.js">
      <script type="text/javascript" src="/classic.js"></script>
      <link rel="preload" href="/c.js" as="script">`;
    expect(firstScreenScripts(html)).toEqual(["/a.js", "/b.js"]);
  });
});

describe("measureFirstScreen", () => {
  it("파일마다 원본·gzip 9단계 크기를 재고 더한다(모듈이 아닌 theme-init.js와 CSS는 넣지 않는다)", () => {
    const measured = measureFirstScreen({ indexHtml: INDEX_HTML, readFile });
    const paths = ["assets/index-B7fuako4.js", "assets/json-ChvLVnqC.js", "assets/reporter-B1GdZV1c.js"];
    expect(measured.problems).toEqual([]);
    expect(measured.files).toEqual(
      paths.map((file) => ({ path: file, bytes: FILES[file].length, gzipBytes: gzip9(FILES[file]) })),
    );
    expect(measured.totalBytes).toBe(paths.reduce((sum, file) => sum + FILES[file].length, 0));
    expect(measured.totalGzipBytes).toBe(paths.reduce((sum, file) => sum + gzip9(FILES[file]), 0));
    expect(measured.totalGzipBytes).toBeLessThan(measured.totalBytes);
  });

  it("빠진 파일, 다른 출처 스크립트, 모듈 스크립트가 없는 index.html은 문제로 알린다", () => {
    const missing = measureFirstScreen({
      indexHtml: INDEX_HTML.replace("json-ChvLVnqC", "json-Missing1"),
      readFile,
    });
    expect(missing.problems).toEqual([expect.stringContaining("/assets/json-Missing1.js")]);
    const external = measureFirstScreen({
      indexHtml: `<script type="module" src="https://cdn.example.com/x.js"></script>`,
      readFile,
    });
    expect(external.problems).toEqual([expect.stringContaining("https://cdn.example.com/x.js")]);
    const none = measureFirstScreen({ indexHtml: "<html><body></body></html>", readFile });
    expect(none.problems).toEqual([expect.stringContaining("모듈 스크립트")]);
    expect(none.totalGzipBytes).toBe(0);
  });
});

describe("parseBudget·checkBudget", () => {
  it("상한 파일은 양의 정수 한 칸이다", () => {
    expect(parseBudget(JSON.stringify({ [BUDGET_KEY]: 136000 }))).toEqual({ limit: 136000 });
    for (const bad of [
      "{",
      "null",
      "[]",
      "{}",
      `{"${BUDGET_KEY}":"136000"}`,
      `{"${BUDGET_KEY}":0}`,
      `{"${BUDGET_KEY}":1.5}`,
    ]) {
      expect(parseBudget(bad).problem, bad).toBeTypeOf("string");
    }
  });

  it("저장소의 상한 파일을 읽을 수 있다", () => {
    const budget = parseBudget(readFileSync(REPO_BUDGET, "utf8"));
    expect(budget.problem).toBeUndefined();
    expect(budget.limit).toBeGreaterThan(0);
  });

  it("합이 상한과 같으면 통과, 1바이트라도 넘으면 실패한다", () => {
    const measured = measureFirstScreen({ indexHtml: INDEX_HTML, readFile });
    const total = measured.totalGzipBytes;
    expect(checkBudget(measured, total)).toEqual([]);
    expect(checkBudget(measured, total + 1)).toEqual([]);
    expect(checkBudget(measured, total - 1)).toEqual([expect.stringContaining("(+1 B")]);
    expect(formatReport(measured, total - 1)[0]).toMatch(/^✗ .*넘음 1 B\)$/);
    expect(formatReport(measured, total + 10)[0]).toMatch(/^✓ .*파일 3개.*남음 10 B\)$/);
  });
});

describe("명령줄", () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "terra-check-bundle-"));
    const dist = path.join(dir, "dist");
    for (const [file, content] of Object.entries(FILES)) {
      mkdirSync(path.dirname(path.join(dist, file)), { recursive: true });
      writeFileSync(path.join(dist, file), content);
    }
    writeFileSync(path.join(dist, "index.html"), INDEX_HTML);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function run(limit, distName = "dist") {
    const budget = path.join(dir, "budget.json");
    writeFileSync(budget, JSON.stringify({ [BUDGET_KEY]: limit }));
    const result = spawnSync(process.execPath, [SCRIPT, path.join(dir, distName), "--budget", budget], {
      cwd: dir,
      encoding: "utf8",
    });
    return { code: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  it("상한 이하면 코드 0, 상한을 낮추면 코드 1", () => {
    const total = measureFirstScreen({ indexHtml: INDEX_HTML, readFile }).totalGzipBytes;
    const pass = run(total);
    expect(pass.code, pass.stderr).toBe(0);
    expect(pass.stdout).toContain(`✓ 첫 화면 JS ${total.toLocaleString("en-US")} B`);
    const lowered = run(total - 1);
    expect(lowered.code).toBe(1);
    expect(lowered.stderr).toContain("상한을 넘었습니다");
  });

  it("빌드 결과가 없거나 상한 파일이 틀리면 코드 1", () => {
    const noBuild = run(100000, "missing");
    expect(noBuild.code).toBe(1);
    expect(noBuild.stderr).toContain("빌드 결과가 없습니다");
    const badBudget = run(-1);
    expect(badBudget.code).toBe(1);
    expect(badBudget.stderr).toContain(BUDGET_KEY);
  });
});
