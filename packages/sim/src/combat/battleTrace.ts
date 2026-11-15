// 전투 관찰자 — 판정 안에서만 보이는 것(굴림 결과·물리·속성 몫·회복량)을 밖에 알린다. docs/adr/2026-11-01-battle-replay.md 1절.
// 리플레이 기록기(replay.ts)가 쓴다. 규칙: 관찰자는 상태를 바꾸지 않고 굴림을 뽑지 않는다(판정 결과가 그대로다 — 시험이 본다).
// 판정 코어는 관찰자가 없으면(undefined) 부르지 않는다. 시각은 부르는 때의 state.tick(그 틱 안)이다.
import type { AttackStages } from "./attackStages.ts";
import type { UnitState } from "./battleTypes.ts";
import type { AttackResult } from "./formula.ts";
import type { MotionKind, StealthCause } from "./moveParts.ts";
import type { CombatSkill } from "./skills.ts";

export interface BattleTrace {
  /** 유닛 기본 공격 한 번(맞은 뒤에 부른다: 대상의 체력·아머·쉴드는 맞은 뒤 값) */
  attack(attacker: UnitState, target: UnitState, hit: AttackResult): void;
  /** 건물 공격 한 번(피해·남은 내구도) */
  building(attacker: UnitState, buildingId: number, damage: number, durability: number): void;
  /** 스킬이 풀린다(시전이 끝났거나 시전 없는 스킬). index = 유닛 스킬 목록 번호, primary = 주 목표(자기·아군 스킬은 자기) */
  skill(unit: UnitState, index: number, primary: UnitState): void;
  /** 피해 스킬의 대상 하나(맞은 뒤). 빗나감·회피도 부른다(두 몫 0). physical·elemental은 고정 피해를 더한 값 */
  skillHit(
    unit: UnitState,
    skill: CombatSkill,
    target: UnitState,
    hit: AttackResult,
    physical: number,
    elemental: number,
  ): void;
  /**
   * 회복(실제로 오른 체력·쉴드, 회복 뒤에 부른다). source = 스킬을 쓴 유닛(효과 주기 회복이면 null), effect = 효과 ID(스킬 회복이면 null).
   * 쉴드를 채우는 스킬·효과가 생기면 shield에 채운 양을 넣는다
   */
  heal(
    source: UnitState | null,
    target: UnitState,
    gain: { readonly hp: number; readonly shield: number },
    effect: string | null,
  ): void;
  /** 지속 피해 한 번(실제로 내려간 체력) */
  dot(target: UnitState, effect: string, amount: number): void;
  /**
   * 공격 한 번의 단계 값(전투 보고서 피해 흐름, attackStages.ts). 이 칸이 있을 때만 판정이 단계를 적는다(없으면 적지 않아 실제 플레이에
   * 비용이 없다). 기본 공격은 attack 뒤, 스킬은 skillHit 뒤(빗나감·회피 포함)에 부른다
   */
  attackStages?(attacker: UnitState, target: UnitState, stages: AttackStages): void;
  /**
   * 움직임 부품이 유닛을 옮겼다(docs/adr/2026-11-15-combat-moves.md 5절): 자기 이동(돌진·도약·점멸·뒷걸음) 또는 맞은 대상(밀치기·끌어오기).
   * unit은 옮긴 뒤 값, fromX·fromY는 앞 칸. 선택 칸이라 옛 관찰자는 그대로다
   */
  motion?(unit: UnitState, kind: MotionKind, fromX: number, fromY: number): void;
  /** 은신 켜짐·꺼짐(까닭: 스킬·공격·들킴·끝남) */
  stealth?(unit: UnitState, on: boolean, cause: StealthCause): void;
  /** 달리기 켜짐·꺼짐 */
  run?(unit: UnitState, on: boolean): void;
  /** 연사: 대상 하나에 shots발(발마다 skillHit이 따른다) */
  multishot?(unit: UnitState, skill: CombatSkill, target: UnitState, shots: number): void;
  /**
   * 밀치기 부딪힘 피해(D-564 1587, moves.ts): source = 밀어낸 유닛, target = 실제로 내려간 체력(amount)을 받은 유닛(밀린 대상 또는 막은
   * 유닛). 방어 없이 체력에서만 빠진다(아머·쉴드 그대로). 리플레이는 지속 피해 사건(효과 move_collision)으로 싣는다
   */
  collision?(source: UnitState, target: UnitState, amount: number): void;
}
