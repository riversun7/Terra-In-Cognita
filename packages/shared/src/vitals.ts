// 유닛 생명 수치(HP·아머 HP·쉴드 HP)의 전투 밖 셈과 조회 모양 — 기획 D-512(사용자: "전투 중이나 후에도 hp,아머,쉴드는 그대로 이고
// 회복계산도 그대로 적용 틱보다는 분단위로 조정하여 서버부하 방지, 클라에서 계산하는게 좋을듯").
// 서버는 값과 그 값의 시각을 저장하고 필요할 때 이 함수로 분 단위 회복을 셈한다(서버 권위). 기기는 서버가 보낸 값에서 같은 함수로
// 그 사이 값을 셈해 보여 준다(tRPC vitals.list, docs/adr/2026-10-31-combat-core.md "바뀜 (D-512 …)").
// 정수만 쓴다: 지난 온전한 분 수 × 분당 회복, 최대에서 멈춘다. 분 경계로 시각을 옮기므로 덜 찬 분은 다음 셈에 남는다.
// 회복 구간(phases, D-514): 부상 단계가 나을 때까지 느린 회복, 주기 회복 물건이 끝날 때까지 더 빠른 회복처럼 시각에 따라 분당 회복이
// 바뀌면, 분 경계마다 그 경계를 포함하는 구간의 회복을 쓴다(구간 끝 until 이하인 첫 구간, 없으면 regen). 회복은 늘 0 이상이고 최대에서
// 멈추므로 값 = min(최대, 처음 + 경계마다 더한 합)이다(나눠 세도 같다).

/** 회복을 셈하는 단위(분). 기획이 정한 단위라 설정 칸이 아니다(D-512 "분단위") */
export const VITALS_MINUTE_MS = 60_000;

/** 생명 수치 세 칸(HP·아머 HP·쉴드 HP) */
export interface VitalPools {
  readonly hp: number;
  readonly armor: number;
  readonly shield: number;
}

/** 회복 구간 하나: 분 경계가 until 이하인 동안 쓰는 분당 회복(부상 단계 느림·주기 회복 물건, D-514) */
export interface VitalsPhase {
  readonly until: number;
  readonly regen: VitalPools;
}

/** 저장한 값 하나: 지금 값·최대·분당 회복과 그 값의 시각(UTC ms) */
export interface VitalsSnapshot {
  readonly values: VitalPools;
  readonly max: VitalPools;
  /**
   * 분당 회복(구간 밖, 다치지 않은 몸). HP = 2차 스탯 HP 회복(D-514), 아머 = 최대 아머 × 설정 칸 ‰(D-514 "쉴드처럼"), 쉴드 = 2차 스탯
   * 쉴드 재생(D-458)
   */
  readonly regen: VitalPools;
  readonly at: number;
  /** 회복 구간(until 차례). 없으면 늘 regen. 지난 구간은 vitalsAt이 뺀다 */
  readonly phases?: readonly VitalsPhase[] | undefined;
}

const ZERO_POOLS: VitalPools = { hp: 0, armor: 0, shield: 0 };

/** at 뒤 분 경계 가운데 t 이하인 것의 수 */
const boundariesUpTo = (at: number, t: number): number =>
  t > at ? Math.floor((t - at) / VITALS_MINUTE_MS) : 0;

/** 분 경계 minutes개에 더할 합(칸마다): 경계마다 그 경계를 포함하는 구간의 회복 */
function regenSum(snapshot: VitalsSnapshot, minutes: number): VitalPools {
  const sum = { hp: 0, armor: 0, shield: 0 };
  const add = (regen: VitalPools, count: number): void => {
    if (count <= 0) return;
    sum.hp += Math.max(0, regen.hp) * count;
    sum.armor += Math.max(0, regen.armor) * count;
    sum.shield += Math.max(0, regen.shield) * count;
  };
  let done = 0;
  for (const phase of snapshot.phases ?? []) {
    const upTo = Math.min(minutes, boundariesUpTo(snapshot.at, phase.until));
    add(phase.regen, upTo - done);
    done = Math.max(done, upTo);
  }
  add(snapshot.regen, minutes - done);
  return sum;
}

const grown = (value: number, max: number, added: number): number =>
  Math.min(Math.max(0, max), Math.max(0, value) + added);

/**
 * nowMs의 값: 지난 온전한 분 경계마다 그때의 분당 회복(구간)을 더하고 최대에서 멈춘다(최대가 줄었으면 최대로 자른다).
 * 돌려주는 at은 마지막으로 센 분 경계(at + 분 수 × 1분)이고, 그 시각까지 끝난 구간은 뺀다. nowMs가 at보다 이르면 시간을 되돌리지 않는다
 */
export function vitalsAt(snapshot: VitalsSnapshot, nowMs: number): VitalsSnapshot {
  const minutes = boundariesUpTo(snapshot.at, nowMs);
  const { values, max, regen } = snapshot;
  const added = minutes > 0 ? regenSum(snapshot, minutes) : ZERO_POOLS;
  const at = snapshot.at + minutes * VITALS_MINUTE_MS;
  const phases = snapshot.phases?.filter((phase) => phase.until > at);
  return {
    values: {
      hp: grown(values.hp, max.hp, added.hp),
      armor: grown(values.armor, max.armor, added.armor),
      shield: grown(values.shield, max.shield, added.shield),
    },
    max,
    regen,
    at,
    ...(phases && phases.length > 0 ? { phases } : {}),
  };
}

/** 다음 분 경계에 쓰는 분당 회복(그 경계를 포함하는 구간, 없으면 regen) */
export function vitalsRegenNow(snapshot: VitalsSnapshot): VitalPools {
  const next = snapshot.at + VITALS_MINUTE_MS;
  return snapshot.phases?.find((phase) => phase.until >= next)?.regen ?? snapshot.regen;
}

/** 세 칸이 모두 최대인가(저장할 까닭이 없다: 저장한 줄이 없으면 가득으로 본다) */
export function vitalsFull(snapshot: VitalsSnapshot): boolean {
  const { values, max } = snapshot;
  return values.hp >= max.hp && values.armor >= max.armor && values.shield >= max.shield;
}

/** 다음에 값이 바뀌는 시각(덜 찬 칸에 회복이 있으면 다음 분 경계, 없으면 null) — 기기가 다시 그릴 때 */
export function vitalsNextChange(snapshot: VitalsSnapshot): number | null {
  const { values, max } = snapshot;
  // 지금 구간에 회복이 없어도 뒤 구간(예: 부상이 나은 뒤)에 있으면 다음 경계에 다시 본다
  const regens = [vitalsRegenNow(snapshot), snapshot.regen, ...(snapshot.phases ?? []).map((p) => p.regen)];
  const pending = regens.some(
    (regen) =>
      (values.hp < max.hp && regen.hp > 0) ||
      (values.armor < max.armor && regen.armor > 0) ||
      (values.shield < max.shield && regen.shield > 0),
  );
  return pending ? snapshot.at + VITALS_MINUTE_MS : null;
}

/** 유닛 하나의 생명 수치(서버가 응답 시각까지 셈한 값) */
export interface VitalsView extends VitalsSnapshot {
  /** 세계 유닛 ID */
  readonly unit: number;
  /** 사이보그 본체인가 */
  readonly cyborg: boolean;
  /** 부상 단계(1 경상·2 중상·3 중태, D-145)와 나을 시각 — 회복이 느리다(D-514). 다치지 않았으면 없음 */
  readonly injury?: { readonly stage: number; readonly until: number } | undefined;
}

/** tRPC vitals.list: 로그인한 본인의 사이보그와 보유 유닛 */
export interface VitalsListResponse {
  /** 소유 주체가 있는가(없으면 빈 목록) */
  readonly hasOwner: boolean;
  readonly units: readonly VitalsView[];
  /** 서버 시각(UTC ms) — 기기는 받은 뒤 흐른 시간을 더해 셈한다 */
  readonly generatedAt: number;
}
