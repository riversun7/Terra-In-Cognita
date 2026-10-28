// 검사 스크립트 공용 함수
import { execFileSync } from "node:child_process";

/** git 명령 실행 결과(문자열) */
export function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** 저장소의 추적 파일 + 아직 추적 전인 새 파일 목록 (.gitignore 제외) */
export function listFiles() {
  return git(["ls-files", "--cached", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
}

export function fail(lines) {
  for (const line of lines) console.error(`✗ ${line}`);
  process.exit(1);
}
