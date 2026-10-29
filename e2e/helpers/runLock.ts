// 화면 시험 실행 잠금·프로세스 확인 — 한 작업 트리에서 화면 시험은 한 번에 하나만 돈다(빌드 결과, e2e/test-results를 함께 쓴다).
// - 잠금은 실행기 프로세스가 설정 파일(playwright.config.ts)을 읽을 때 잡는다. Playwright는 설정을 읽은 뒤 결과 폴더를 지우고
//   전역 준비를 돌린다. 그래서 전역 준비에서 막으면 이미 돌고 있는 실행의 결과 폴더가 지워진 뒤다(2026-10-29 확인).
// - 잠금은 실행기가 끝날 때(exit) 놓는다. 신호로 죽으면 파일이 남지만 주인이 없으므로 다음 실행이 가져간다.
// - 전역 준비가 만든 서버·DB·임시 폴더는 실행 기록(RUN_STATE_FILE, global-setup.ts)에 적는다.
// 프로세스는 번호와 시작 시각(/proc/<pid>/stat 22번째 칸)으로 가린다. 번호는 금방 다시 쓰인다(이 기계 상한 32,768).
// 리눅스 /proc만 본다. /proc이 없으면 늘 "살아 있지 않음"이라 막지도 죽이지도 않는다.
// 이 파일은 설정 파일이 가져오므로 @playwright/test의 값(test 등)을 가져오지 않는다.
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 저장소 뿌리(끝에 /). 실행기·서버가 여기서 돈다 */
export const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const TREE_TAG = createHash("sha256").update(ROOT).digest("hex").slice(0, 12);
/** 실행 잠금(작업 트리마다 하나): 잡은 실행기 */
export const RUN_LOCK_FILE = path.join(tmpdir(), `terra-e2e-lock-${TREE_TAG}.json`);
/** 실행 기록(작업 트리마다 하나): 이번 실행이 만든 것. 정리를 마치면 지운다. 남아 있으면 앞 실행이 정리하지 못한 것이다 */
export const RUN_STATE_FILE = path.join(tmpdir(), `terra-e2e-run-${TREE_TAG}.json`);

/** 프로세스 하나: 번호 + 시작 시각(부팅 뒤 클록 틱) */
export interface ProcessRef {
  pid: number;
  start: string;
}

/** 살아 있는 프로세스면 그 시작 시각, 없으면 null */
function startTime(pid: number): string | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    // 2번째 칸(명령 이름)에 공백·괄호가 들 수 있어 마지막 ")" 뒤부터 센다. 그 뒤 첫 칸이 3번째 칸이다
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    return fields[19] ?? null;
  } catch {
    return null;
  }
}

/** 지금 살아 있는 프로세스를 가리키는 값. 없으면 null */
export function processRef(pid: number): ProcessRef | null {
  const start = startTime(pid);
  return start === null ? null : { pid, start };
}

/** 적어 둔 그 프로세스가 아직 살아 있는지(같은 번호를 다시 받은 다른 프로세스는 아니다) */
export function isAlive(ref: ProcessRef | null): ref is ProcessRef {
  return ref !== null && startTime(ref.pid) === ref.start;
}

/** 파일에서 읽은 값 → ProcessRef. 모양이 틀리면 null */
export function parseProcessRef(value: unknown): ProcessRef | null {
  if (typeof value !== "object" || value === null) return null;
  const pid: unknown = Reflect.get(value, "pid");
  const start: unknown = Reflect.get(value, "start");
  return Number.isSafeInteger(pid) && typeof pid === "number" && pid > 0 && typeof start === "string"
    ? { pid, start }
    : null;
}

function readLockHolder(): ProcessRef | null {
  try {
    return parseProcessRef(JSON.parse(readFileSync(RUN_LOCK_FILE, "utf8")));
  } catch {
    return null;
  }
}

/** 이 프로세스인지(번호와 시작 시각 둘 다. 죽은 실행기의 번호를 이 프로세스가 다시 받았을 수 있다) */
const isMe = (ref: ProcessRef | null): boolean =>
  ref !== null && ref.pid === process.pid && ref.start === startTime(process.pid);

function releaseRunLock(): void {
  if (isMe(readLockHolder())) rmSync(RUN_LOCK_FILE, { force: true });
}

/**
 * 이 작업 트리의 실행 잠금을 잡는다(실행기에서, 결과 폴더를 지우기 전에). 다른 실행이 잡고 있으면 오류를 낸다.
 * 같은 프로세스가 다시 부르면 그대로 둔다. 주인이 죽은 잠금은 지우고 다시 잡는다
 * (그 순간 둘이 함께 가져가면 둘 다 잡을 수 있다. 전역 준비가 실행 기록으로 한 번 더 막는다).
 */
export function acquireRunLock(): void {
  const me = processRef(process.pid);
  if (me === null) return;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      writeFileSync(RUN_LOCK_FILE, JSON.stringify(me), { flag: "wx" });
      process.once("exit", releaseRunLock);
      return;
    } catch (error) {
      if (!(error instanceof Error && Reflect.get(error, "code") === "EEXIST")) throw error;
    }
    const holder = readLockHolder();
    if (isMe(holder)) return;
    if (isAlive(holder)) {
      throw new Error(
        `이 작업 트리에서 다른 화면 시험이 돌고 있습니다(실행기 pid ${holder.pid}, 잠금 ${RUN_LOCK_FILE}). ` +
          "끝난 뒤 다시 돌리세요. 결과 폴더(e2e/test-results)는 건드리지 않았습니다.",
      );
    }
    // 주인이 없다(신호로 끝난 실행, 쓰다 만 파일): 지우고 다시
    rmSync(RUN_LOCK_FILE, { force: true });
  }
  throw new Error(`실행 잠금을 잡지 못했습니다: ${RUN_LOCK_FILE}`);
}
