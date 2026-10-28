// 계정 경로 시도 제한 — 접속 주소별, 아이디별, 전체 (ADR 2026-10-28-auth-and-accounts)
// 숫자는 처음 값이다(Assumed). 쓰면서 고친다. 메모리에만 있어 서버를 다시 켜면 처음부터다.
// - 들어가기: "새 아이디" 확인 한 번도 로그인 시도 한 번으로 센다(아이디가 있는지 싸게 알아낼 수 없게).
// - 전체 상한은 비밀번호 해시(scrypt, 1회 약 100~200ms)가 Node 작업 스레드를 다 쓰지 않게 막는다.
// - 비밀번호 찾기는 확인 메일이 없어서 들어가기보다 엄격하다.
import { createRateLimiter, type RateLimiter } from "../rateLimit.ts";

/** 용량(capacity)과 시간당 다시 채우는 수 */
export interface LimitSetting {
  capacity: number;
  perHour: number;
}

export const ACCOUNT_LIMITS = {
  /** 들어가기: 주소별 분당 10회 */
  enterPerIp: { capacity: 10, perHour: 600 },
  /** 들어가기: 아이디별 15분에 10회 */
  enterPerId: { capacity: 10, perHour: 40 },
  /** 들어가기: 전체 초당 10회(순간 20회) */
  enterGlobal: { capacity: 20, perHour: 36_000 },
  /** 계정 만들기: 주소별 시간당 3개 */
  createPerIp: { capacity: 3, perHour: 3 },
  /** 계정 만들기: 전체 시간당 30개 */
  createGlobal: { capacity: 30, perHour: 30 },
  /** 비밀번호 찾기: 주소별 시간당 5회 */
  resetPerIp: { capacity: 5, perHour: 5 },
  /** 비밀번호 찾기: 아이디별 시간당 3회 */
  resetPerId: { capacity: 3, perHour: 3 },
  /** 비밀번호 찾기: 전체 시간당 30회 */
  resetGlobal: { capacity: 30, perHour: 30 },
} satisfies Record<string, LimitSetting>;

export type AccountLimitName = keyof typeof ACCOUNT_LIMITS;
export type AccountLimiters = Record<AccountLimitName, RateLimiter>;

export function createAccountLimiters(
  now: () => number,
  overrides: Partial<Record<AccountLimitName, LimitSetting>> = {},
): AccountLimiters {
  const make = (name: AccountLimitName): RateLimiter => {
    const setting = overrides[name] ?? ACCOUNT_LIMITS[name];
    return createRateLimiter({ capacity: setting.capacity, refillPerMinute: setting.perHour / 60, now });
  };
  return {
    enterPerIp: make("enterPerIp"),
    enterPerId: make("enterPerId"),
    enterGlobal: make("enterGlobal"),
    createPerIp: make("createPerIp"),
    createGlobal: make("createGlobal"),
    resetPerIp: make("resetPerIp"),
    resetPerId: make("resetPerId"),
    resetGlobal: make("resetGlobal"),
  };
}

/** 여러 제한을 차례로 쓴다. 막힌 것이 있으면 기다릴 시간(초, 1 이상)을 돌려주고, 통과하면 null */
export function takeAll(checks: ReadonlyArray<readonly [RateLimiter, string]>): number | null {
  for (const [limiter, key] of checks) {
    if (!limiter.take(key)) return Math.max(1, Math.ceil(limiter.retryAfterMs(key) / 1_000));
  }
  return null;
}
