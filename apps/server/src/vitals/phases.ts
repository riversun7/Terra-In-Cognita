// 생명 수치 회복 구간 — 기획 D-514(쓰러진 유닛도 자동 회복, 부상 단계에 따라 느리게)·D-512 346(주기 회복 물건은 전투 밖에서 분 단위).
// 저장한 값 위에 세계가 아는 것(부상 단계·나을 시각, 걸린 주기 회복 효과)으로 회복 구간을 만든다(@terra/shared vitalsAt이 센다).
// - 부상: 단계가 내려갈 때까지 분당 HP 회복 × 그 단계 ‰(설정 칸 n54_injury_regen_1~3). 부상 4단계(D-521)는 한 단계씩 내려가므로
//   지금 단계 구간 뒤에 아래 단계 구간(later)이 이어진다(빨강 ‰ → 노랑 ‰ → 흰 ‰ → 다치지 않음). 아머·쉴드는 그대로다.
// - 주기 회복 물건(전투 밖, 보유 물건 use가 unit_effects에 넣은 heal 효과): 끝 시각까지 분당 HP를 더한다(값 = 분당 양).
// 구간 경계 = 그 시각들(지금 값의 시각 뒤만). 경계마다 그 경계 이하 구간의 회복 = 바탕 × 부상 ‰ + 아직 끝나지 않은 물건 합.
import type { VitalPools, VitalsPhase } from "@terra/shared/vitals";

/** 유닛 하나의 회복을 바꾸는 것(세계가 읽어 준다) */
export interface VitalsModifiers {
  /** 부상(지금 단계가 내려갈 때까지 HP 회복 ‰). 다치지 않았으면 없음 */
  readonly injury?:
    | { readonly stage: number; readonly untilMs: number; readonly regenPm: number }
    | undefined;
  /** 지금 단계 뒤 아래 단계 구간(끝 시각 차례, D-521 한 단계씩 자연 치유). 없으면 지금 단계가 끝나면 다치지 않음 */
  readonly later?: readonly { readonly untilMs: number; readonly regenPm: number }[] | undefined;
  /** 걸린 주기 회복(전투 밖): 끝 시각·분당 HP */
  readonly hot: readonly { readonly untilMs: number; readonly hpPerMinute: number }[];
}

export const NO_MODIFIERS: VitalsModifiers = { hot: [] };

/** 바탕 회복과 바꾸는 것 → 회복 구간(at 뒤 경계만, until 차례). 바꾸는 것이 없으면 빈 목록 */
export function regenPhases(regen: VitalPools, mods: VitalsModifiers, at: number): VitalsPhase[] {
  // 부상 구간: 지금 단계 + 아래 단계(끝 시각 차례). at 뒤에 끝나는 것만, ‰가 1000인 구간도 경계로 둔다(뒤 구간과 나뉘게)
  const windows = mods.injury
    ? [{ untilMs: mods.injury.untilMs, regenPm: mods.injury.regenPm }, ...(mods.later ?? [])].filter(
        (window) => window.untilMs > at,
      )
    : [];
  const injured = windows.some((window) => window.regenPm !== 1000);
  const hot = mods.hot.filter((entry) => entry.untilMs > at && entry.hpPerMinute > 0);
  const bounds = [
    ...new Set([
      ...(injured ? windows.map((window) => window.untilMs) : []),
      ...hot.map((entry) => entry.untilMs),
    ]),
  ].toSorted((a, b) => a - b);
  return bounds.map((until) => {
    const window = injured ? windows.find((entry) => until <= entry.untilMs) : undefined;
    const slowed = window ? Math.floor((regen.hp * Math.max(0, window.regenPm)) / 1000) : regen.hp;
    const extra = hot.reduce((sum, entry) => (entry.untilMs >= until ? sum + entry.hpPerMinute : sum), 0);
    return { until, regen: { ...regen, hp: slowed + extra } };
  });
}
