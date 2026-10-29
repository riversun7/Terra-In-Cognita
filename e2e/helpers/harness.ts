// 시험 틀이 시험에 넘기는 값 — 전역 준비(global-setup.ts)가 환경 변수 E2E_HARNESS(JSON 한 줄)에 넣고, 시험 작업자가 읽는다.
// Playwright는 전역 준비가 끝난 뒤 작업자를 띄우므로 전역 준비에서 넣은 환경 변수가 작업자에 그대로 간다.

export const HARNESS_ENV = "E2E_HARNESS";

/** 가짜 계정 이름. 아이디·역할은 global-setup.ts의 ACCOUNTS 표 */
export type AccountName = "player" | "admin";
export const ACCOUNT_NAMES = ["player", "admin"] as const satisfies readonly AccountName[];

export interface HarnessAccount {
  /** 로그인 아이디 */
  id: string;
  /** 이번 실행에서 만든 무작위 비밀번호(버리는 DB의 가짜 계정) */
  password: string;
  /** 이 계정으로 들어간 세션(쿠키) 파일 — Playwright storageState 모양 */
  storageState: string;
}

export interface Harness {
  /** 빌드한 서버 주소 = BETTER_AUTH_URL(같은 출처 검사 기준). 예: http://127.0.0.1:4471 */
  baseURL: string;
  accounts: Record<AccountName, HarnessAccount>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isHarnessAccount(value: unknown): value is HarnessAccount {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.password === "string" &&
    typeof value.storageState === "string"
  );
}

function isHarness(value: unknown): value is Harness {
  if (!isRecord(value) || typeof value.baseURL !== "string" || !isRecord(value.accounts)) return false;
  const { accounts } = value;
  return ACCOUNT_NAMES.every((name) => isHarnessAccount(accounts[name]));
}

let cached: Harness | undefined;

/** 시험 틀 값 읽기. pnpm e2e(전역 준비) 밖에서 부르면 알기 쉬운 오류를 낸다 */
export function harness(): Harness {
  if (cached) return cached;
  const raw = process.env[HARNESS_ENV];
  if (!raw) {
    throw new Error(
      `${HARNESS_ENV}가 없습니다. 화면 시험은 pnpm e2e로 돌립니다(전역 준비가 서버·DB·계정을 만든다).`,
    );
  }
  const data: unknown = JSON.parse(raw);
  if (!isHarness(data)) throw new Error(`${HARNESS_ENV}의 모양이 틀렸습니다(global-setup.ts와 맞춰 보세요).`);
  cached = data;
  return data;
}
