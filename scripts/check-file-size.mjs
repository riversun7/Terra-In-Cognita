// 파일 크기 검사 — 600줄 초과 경고, 1,000줄 초과 실패 (AGENTS.md 4장)
import { existsSync, readFileSync } from "node:fs";
import { fail, listFiles } from "./lib.mjs";

const WARN_LINES = 600;
const FAIL_LINES = 1000;
const CODE = /\.(ts|tsx|js|mjs|cjs|css)$/;
// 자동 생성 파일과 외부에서 그대로 복사한 스킬은 제외
const GENERATED = [/\/src\/paraglide\//, /\/dist\//, /^\.claude\/skills\//, /^\.agent\//];

const errors = [];
for (const file of listFiles()) {
  if (!CODE.test(file) || GENERATED.some((p) => p.test(file)) || !existsSync(file)) continue;
  const lines = readFileSync(file, "utf8").split("\n").length;
  if (lines > FAIL_LINES) errors.push(`${file}: ${lines}줄 (상한 ${FAIL_LINES}줄) — 파일을 나누세요.`);
  else if (lines > WARN_LINES) console.warn(`! ${file}: ${lines}줄 (권장 ${WARN_LINES}줄 이하)`);
}
if (errors.length > 0) fail(errors);
console.log("✓ 파일 크기 규칙 통과");
