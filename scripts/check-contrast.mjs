// 디자인 값 검사 — 테마마다 글자·초점·입력칸 대비, 화면 CSS에 색·px 값을 직접 쓰지 않았는지. 규칙은 design-tokens.mjs
// ADR 2026-10-28-design-system "검사". 사용: node scripts/check-contrast.mjs [--print]  (--print: 잰 값을 모두 보인다)
import { readFileSync } from "node:fs";
import path from "node:path";
import { checkContrast, findRawValues, themeTokens } from "./design-tokens.mjs";
import { fail, listFiles } from "./lib.mjs";

const TOKENS = "apps/game/src/styles/tokens.css";
const { rows, problems } = checkContrast(themeTokens(readFileSync(TOKENS, "utf8")));

if (process.argv.includes("--print")) {
  for (const row of rows) {
    console.log(
      `${row.pass ? "PASS" : "FAIL"} ${row.theme.padEnd(8)} ${row.ratio.toFixed(2).padStart(5)} (최소 ${row.min}) ${row.pair}  ${row.fg} / ${row.bg}`,
    );
  }
}

// 화면 CSS: 토큰 파일 밖의 게임 앱 CSS
const screenCss = listFiles().filter(
  (file) => /^apps\/game\/src\/.*\.css$/.test(file) && path.posix.normalize(file) !== TOKENS,
);
for (const file of screenCss) {
  for (const { line, text } of findRawValues(readFileSync(file, "utf8"))) {
    problems.push(`${file}:${line}: 색·px 값은 ${TOKENS}에 토큰으로 두고 var(--…)로 씁니다 → ${text}`);
  }
}

if (problems.length > 0) fail(problems);
const lowest = (kind) =>
  Math.min(...rows.filter((row) => row.min === kind).map((row) => row.ratio)).toFixed(2);
console.log(
  `✓ 디자인 값 검사 통과 — 테마 4개 대비 ${rows.length}쌍(최저: 글자 ${lowest(4.5)}, 선명 본문 ${lowest(7)}, 초점·테두리 ${lowest(3)}), 화면 CSS ${screenCss.length}개에 직접 쓴 색·px 없음`,
);
