// 유닛 생명 수치(HP·아머 HP·쉴드 HP)의 전투 밖 셈과 조회 모양 — 기획 D-512(사용자: "전투 중이나 후에도 hp,아머,쉴드는 그대로 이고
// 회복계산도 그대로 적용 틱보다는 분단위로 조정하여 서버부하 방지, 클라에서 계산하는게 좋을듯").
// 서버는 값과 그 값의 시각을 저장하고 필요할 때 이 함수로 분 단위 회복을 셈한다(서버 권위). 기기는 서버가 보낸 값에서 같은 함수로
// 그 사이 값을 셈해 보여 준다(tRPC vitals.list, docs/adr/2026-10-31-combat-core.md "바뀜 (D-512 …)").
// 정수만 쓴다: 지난 온전한 분 수 × 분당 회복, 최대에서 멈춘다. 분 경계로 시각을 옮기므로 덜 찬 분은 다음 셈에 남는다.

/** 회복을 셈하는 단위(분). 기획이 정한 단위라 설정 칸이 아니다(D-512 "분단위") */
export const VITALS_MINUTE_MS = 60_000;

/** 생명 수치 세 칸(HP·아머 HP·쉴드 HP) */
export interface VitalPools {
  readonly hp: number;
  readonly armor: number;
  readonly shield: number;
}

/** 저장한 값 하나: 지금 값·최대·분당 회복과 그 값의 시각(UTC ms) */
export interface VitalsSnapshot {
  readonly values: VitalPools;
  readonly max: VitalPools;
  /** 분당 회복. 쉴드 = 2차 스탯 쉴드 재생(D-458). HP·아머는 회복 규칙이 아직 없어 0이다(질문 343·344) */
  readonly regen: VitalPools;
  readonly at: number;
}

const grown = (value: number, max: number, regen: number, minutes: number): number =>
  Math.min(Math.max(0, max), Math.max(0, value) + Math.max(0, regen) * minutes);

/**
 * nowMs의 값: 지난 온전한 분 수만큼 분당 회복을 더하고 최대에서 멈춘다(최대가 줄었으면 최대로 자른다).
 * 돌려주는 at은 마지막으로 센 분 경계(at + 분 수 × 1분)다. nowMs가 at보다 이르면 시간을 되돌리지 않는다
 */
export function vitalsAt(snapshot: VitalsSnapshot, nowMs: number): VitalsSnapshot {
  const minutes = nowMs > snapshot.at ? Math.floor((nowMs - snapshot.at) / VITALS_MINUTE_MS) : 0;
  const { values, max, regen } = snapshot;
  return {
    values: {
      hp: grown(values.hp, max.hp, regen.hp, minutes),
      armor: grown(values.armor, max.armor, regen.armor, minutes),
      shield: grown(values.shield, max.shield, regen.shield, minutes),
    },
    max,
    regen,
    at: snapshot.at + minutes * VITALS_MINUTE_MS,
  };
}

/** 세 칸이 모두 최대인가(저장할 까닭이 없다: 저장한 줄이 없으면 가득으로 본다) */
export function vitalsFull(snapshot: VitalsSnapshot): boolean {
  const { values, max } = snapshot;
  return values.hp >= max.hp && values.armor >= max.armor && values.shield >= max.shield;
}

/** 다음에 값이 바뀌는 시각(덜 찬 칸에 회복이 있으면 다음 분 경계, 없으면 null) — 기기가 다시 그릴 때 */
export function vitalsNextChange(snapshot: VitalsSnapshot): number | null {
  const { values, max, regen } = snapshot;
  const pending =
    (values.hp < max.hp && regen.hp > 0) ||
    (values.armor < max.armor && regen.armor > 0) ||
    (values.shield < max.shield && regen.shield > 0);
  return pending ? snapshot.at + VITALS_MINUTE_MS : null;
}

/** 유닛 하나의 생명 수치(서버가 응답 시각까지 셈한 값) */
export interface VitalsView extends VitalsSnapshot {
  /** 세계 유닛 ID */
  readonly unit: number;
  /** 사이보그 본체인가 */
  readonly cyborg: boolean;
}

/** tRPC vitals.list: 로그인한 본인의 사이보그와 보유 유닛 */
export interface VitalsListResponse {
  /** 소유 주체가 있는가(없으면 빈 목록) */
  readonly hasOwner: boolean;
  readonly units: readonly VitalsView[];
  /** 서버 시각(UTC ms) — 기기는 받은 뒤 흐른 시간을 더해 셈한다 */
  readonly generatedAt: number;
}
