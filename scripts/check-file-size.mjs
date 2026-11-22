// 파일 크기 검사 — 5,000줄 초과 경고만, 실패 없음 (AGENTS.md 4장, 사용자 결정 2026-11-22, ADR 2026-11-22-file-size-warning-only.md)
import { existsSync, readFileSync } from "node:fs";
import { listFiles } from "./lib.mjs";

const WARN_LINES = 5000;
const CODE = /\.(ts|tsx|js|mjs|cjs|css)$/;
// 자동 생성 파일과 외부에서 그대로 복사한 스킬은 제외
// drizzle-kit이 만드는 마이그레이션(apps/server/drizzle/)도 자동 생성 파일이다
const GENERATED = [
  /\/src\/paraglide\//,
  /\/dist\//,
  /^\.claude\/skills\//,
  /^\.agent\//,
  /^apps\/server\/drizzle\//,
];

for (const file of listFiles()) {
  if (!CODE.test(file) || GENERATED.some((p) => p.test(file)) || !existsSync(file)) continue;
  const lines = readFileSync(file, "utf8").split("\n").length;
  // 경고만 한다(검사를 실패시키지 않는다). 나눌 때는 줄 수가 아니라 기능 단위로 나눈다
  if (lines > WARN_LINES) console.warn(`! ${file}: ${lines}줄 (권장 ${WARN_LINES}줄 이하)`);
}
console.log("✓ 파일 크기 규칙 통과");
