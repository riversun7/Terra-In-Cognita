// 간단한 비밀값 검사 — 커밋 전에 흔한 유출 형태만 빠르게 잡는다.
// 전체 검사는 CI의 gitleaks가 맡는다.
import { existsSync, readFileSync } from "node:fs";
import { fail, git, listFiles } from "./lib.mjs";

const staged = process.argv.includes("--staged");
const files = staged
  ? git(["diff", "--cached", "--name-only", "--diff-filter=ACM"]).split("\n").filter(Boolean)
  : listFiles();

const PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "개인 키"],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/, "GitHub 토큰"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS 액세스 키"],
  [
    // 값이 영문·숫자로 시작할 때만 잡는다 (${VAR}, <값>, %s, :?오류문구 같은 자리표시는 통과)
    /\b(PG_PASSWORD|POSTGRES_PASSWORD|JWT_SECRET|DB_PASSWORD)\s*[:=]\s*["']?[A-Za-z0-9][^\s"']{3,}/,
    "비밀번호·시크릿 값",
  ],
];
const errors = [];
for (const file of files) {
  if (/(^|\/)\.env(\.|$)/.test(file) && !file.endsWith(".env.example")) {
    errors.push(`${file}: .env 파일은 커밋하지 않습니다.`);
    continue;
  }
  if (!existsSync(file) || file.startsWith("docs/research/")) continue;
  const text = readFileSync(file, "utf8");
  if (text.includes("\u0000")) continue; // 이진 파일 건너뜀
  text.split("\n").forEach((line, index) => {
    for (const [pattern, label] of PATTERNS) {
      if (pattern.test(line)) errors.push(`${file}:${index + 1}: ${label}로 보이는 값이 있습니다.`);
    }
  });
}
if (errors.length > 0) fail(errors);
console.log("✓ 비밀값 검사 통과");
