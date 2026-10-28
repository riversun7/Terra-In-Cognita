// 작업 기록 목차 생성 — docs/worklog/**/*.md를 읽어 docs/WORKLOG.md를 만든다.
// --check: 파일을 쓰지 않고, 목차가 최신이 아니면 실패한다 (CI·pre-push).
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fail } from "./lib.mjs";

const ROOT = "docs/worklog";
const OUTPUT = "docs/WORKLOG.md";

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const entries = walk(ROOT)
  .filter((file) => file.endsWith(".md") && path.basename(file) !== "TEMPLATE.md")
  .map((file) => {
    const text = readFileSync(file, "utf8");
    const title = text.match(/^# (.+)$/m)?.[1]?.trim() ?? path.basename(file, ".md");
    const when =
      text
        .match(/^- 일시:\s*(.+)$/m)?.[1]
        ?.replace(/\s*\(KST\)\s*$/, "")
        .trim() ?? "";
    const tool = text.match(/^- 작업 도구:\s*(.+)$/m)?.[1]?.trim() ?? "";
    return { file, title, when, tool };
  })
  .toSorted((a, b) => b.file.localeCompare(a.file));

const rows = entries.map((e) => {
  const link = path.relative("docs", e.file).split(path.sep).join("/");
  return `| ${e.when} | ${e.title} | ${e.tool} | [${path.basename(e.file, ".md")}](${link}) |`;
});
const content = [
  "# WORKLOG",
  "",
  "작업 기록 목차. **자동 생성 파일이므로 직접 고치지 않는다** (`pnpm docs:index`).",
  "실제 기록은 `docs/worklog/` 아래 작업마다 파일 하나로 남긴다(양식: `docs/worklog/TEMPLATE.md`).",
  "",
  "| 일시 (KST) | 작업 | 작업 도구 | 기록 |",
  "|---|---|---|---|",
  ...rows,
  "",
].join("\n");

if (process.argv.includes("--check")) {
  const current = readFileSync(OUTPUT, "utf8");
  if (current !== content) fail([`${OUTPUT}가 최신이 아닙니다. \`pnpm docs:index\`를 실행하세요.`]);
  console.log("✓ 작업 기록 목차 최신");
} else {
  writeFileSync(OUTPUT, content);
  console.log(`✓ ${OUTPUT} 생성 (${entries.length}건)`);
}
