// 새 버전 적용 규칙 — 순수 함수(시험 대상). 브라우저 연결은 updates.ts가 한다.
// 규칙(ADR 2026-10-28-pwa-and-browser-baseline): "켤 때 자동 + 쓰는 중엔 안내"
// - 켤 때: 앱을 새로 열었을 때, 또는 30분 넘게 숨겨졌다가 다시 보일 때
// - 그 뒤 15초 안, 첫 터치·키 입력 전에 새 버전이 준비되면 바로 적용(새로고침). 그 밖에는 배너로 알린다.
// 시각은 모두 ms(벽시계, Date.now). 숨겨진 동안 기기가 잠들어도 흐르는 시간을 재야 해서다.

export const UPDATE_TIMING = {
  /** 켠 뒤 이 시간 안에(첫 입력 전) 새 버전이 준비되면 바로 적용한다 */
  launchWindowMs: 15_000,
  /** 이보다 오래 숨겨졌다가 다시 보이면 새로 켠 것으로 본다 */
  resumeAfterHiddenMs: 30 * 60_000,
  /** 화면이 다시 보일 때 새 버전을 확인하는 최소 간격 */
  visibleCheckIntervalMs: 10 * 60_000,
  /** 강제 적용: 새 버전 설치를 기다리는 최대 시간. 없으면 그냥 새로고침한다 */
  forceWaitMs: 15_000,
  /** 적용 요청 뒤 새 버전이 넘겨받기를 기다리는 최대 시간. 지나면 그냥 새로고침한다 */
  applyTimeoutMs: 5_000,
  /** 자동 새로고침 사이 최소 간격 — 새로고침이 끝없이 반복되지 않게 막는다 */
  autoReloadGuardMs: 60_000,
} as const;

/** 마지막 "켤 때" 시점과 그 뒤 첫 입력이 있었는지 */
export interface LaunchWindow {
  readonly startedAt: number;
  readonly inputSeen: boolean;
}

/** 새 버전이 준비됐을 때: 바로 적용 또는 배너로 안내 */
export type ReadyAction = "apply" | "prompt";

export function decideReadyAction(launch: LaunchWindow, now: number): ReadyAction {
  const elapsed = now - launch.startedAt;
  return !launch.inputSeen && elapsed >= 0 && elapsed <= UPDATE_TIMING.launchWindowMs ? "apply" : "prompt";
}

/**
 * 자동 새로고침을 해도 되는지. 직전 자동 새로고침과 너무 가까우면 막는다(반복 고리 방지).
 * 시계가 뒤로 간 경우도 차이의 절댓값으로 본다.
 */
export function canAutoReload(lastAutoReloadAt: number | null, now: number): boolean {
  return lastAutoReloadAt === null || Math.abs(now - lastAutoReloadAt) >= UPDATE_TIMING.autoReloadGuardMs;
}

/** 저장해 둔 시각(문자열)을 읽는다. 없거나 깨졌으면 null */
export function parseStoredTime(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** 화면 숨김·보임 기록 */
export interface VisibilityTracker {
  /** 마지막으로 숨겨진 시각. 보이는 중이면 null */
  readonly hiddenAt: number | null;
  /** 화면이 다시 보여서 새 버전을 확인한 마지막 시각 */
  readonly lastCheckAt: number | null;
}

export const INITIAL_VISIBILITY: VisibilityTracker = { hiddenAt: null, lastCheckAt: null };

export function onHidden(tracker: VisibilityTracker, now: number): VisibilityTracker {
  // 이미 숨겨진 상태면 처음 숨겨진 시각을 유지한다
  return tracker.hiddenAt === null ? { ...tracker, hiddenAt: now } : tracker;
}

export interface VisibleOutcome {
  readonly next: VisibilityTracker;
  /** 30분 넘게 숨겨졌다가 돌아옴 → 다시 "켤 때"로 본다 */
  readonly resumed: boolean;
  /** 새 버전을 확인할 차례인지(10분에 1번까지) */
  readonly check: boolean;
}

export function onVisible(tracker: VisibilityTracker, now: number): VisibleOutcome {
  const resumed = tracker.hiddenAt !== null && now - tracker.hiddenAt >= UPDATE_TIMING.resumeAfterHiddenMs;
  const check =
    resumed ||
    tracker.lastCheckAt === null ||
    Math.abs(now - tracker.lastCheckAt) >= UPDATE_TIMING.visibleCheckIntervalMs;
  return {
    next: { hiddenAt: null, lastCheckAt: check ? now : tracker.lastCheckAt },
    resumed,
    check,
  };
}
