// 검사 스크립트 공용 함수
import { execFileSync } from "node:child_process";

/** git 명령 실행 결과(문자열). 큰 파일(git show)도 읽게 출력 상한을 넉넉히 둔다 */
export function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

/** 저장소의 추적 파일 + 아직 추적 전인 새 파일 목록 (.gitignore 제외) */
export function listFiles() {
  return git(["ls-files", "--cached", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
}

export function fail(lines) {
  for (const line of lines) console.error(`✗ ${line}`);
  process.exit(1);
}

function commitExists(ref) {
  try {
    git(["rev-parse", "--verify", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * 비교 기준 커밋: 인자(CI는 pull_request.base.sha || event.before) → upstream(@{u}) → HEAD~1 → 없음(null, 첫 커밋).
 * 강제 푸시 등으로 기준 커밋이 사라졌거나 0000…(새 브랜치)이면 다음 후보로 넘어간다.
 */
export function resolveBase(arg) {
  if (arg && !/^0+$/.test(arg) && commitExists(arg)) return arg;
  try {
    return git(["rev-parse", "--verify", "@{u}"]);
  } catch {
    try {
      return git(["rev-parse", "--verify", "HEAD~1"]);
    } catch {
      return null;
    }
  }
}
