// 전투 판정 타입 — battle.ts가 쓰는 사양·상태·결과 모양(직렬화할 수 있는 값만). docs/adr/2026-10-31-combat-core.md
import type { BattleMapInput } from "./battleMap.ts";
import type { ActiveEffect } from "./effects.ts";
import type { AttackProfile, DefenseProfile } from "./formula.ts";
import type { CastState, CombatSkill } from "./skills.ts";

/** 편의 가장자리(들어오는 변): 0 북(y 작음), 1 동, 2 남, 3 서 */
export type Edge = 0 | 1 | 2 | 3;

export interface CombatUnitSpec {
  readonly id: number;
  readonly side: number;
  readonly party: number;
  readonly x: number;
  readonly y: number;
  readonly maxHp: number;
  readonly armorHp: number;
  readonly shieldHp: number;
  readonly attack: AttackProfile;
  /**
   * 스킬 기반별 공격 사양(D-463 211): 물리 = 든 물리 무기(없으면 맨손)·물리 공격력, 속성 = 든 속성 무기(없으면 맨손 속성 자료)·
   * 속성 공격력. 없으면 기본 공격 사양(attack)으로 푼다(시험 유닛)
   */
  readonly skillAttack?: { readonly physical: AttackProfile; readonly elemental: AttackProfile } | undefined;
  readonly defense: DefenseProfile;
  /** 사거리(체비쇼프 칸) */
  readonly range: number;
  /** 곡사(질문 96: 차폐를 넘는다) */
  readonly arc: boolean;
  /** 공격 간격(ms, 행동 속도에서, unitSpec.ts) */
  readonly attackIntervalMs: number;
  /** 한 칸 가는 시간(ms, 전투 속도 C28) */
  readonly moveIntervalMs: number;
  /** 스태미나·MP 최대와 공격 한 번에 드는 양(D-415·D-418) */
  readonly staminaMax: number;
  readonly staminaCost: number;
  /** STA 점수(N13: 1차 AGI·VIT 가중합). 소모 배율을 정한다 */
  readonly staminaScore: number;
  /** 스태미나 회복(분당, 2차 스탯 stamina_regen D-458) */
  readonly staminaRegen: number;
  readonly mpMax: number;
  readonly mpCost: number;
  /** MP 회복(분당, 2차 스탯 mp_regen D-458) */
  readonly mpRegen: number;
  /** 쉴드 재생(분당, 2차 스탯 shield_regen D-458). 전투 중에도 찬다 */
  readonly shieldRegen: number;
  /** 스탯 시야(칸, 가중치 표 sight 행) */
  readonly sight: number;
  /** 시선 높이(16배 cm) */
  readonly eye: number;
  readonly air: boolean;
  /** 지휘 정원(파티 수, D-179·C7) */
  readonly commandCap: number;
  readonly cyborg: boolean;
  /** 건물 피해 배율(천분율, C32) */
  readonly buildingMulPm: number;
  /** 1차 스탯 6개(STR·DEX·AGI·VIT·INT·WIS, 장비 포함): 상태이상 저항(D-429)에 쓴다 */
  readonly primaries: readonly number[];
  /** 쓸 수 있는 스킬(고유 + 장비, 슬롯 수 안, D-426·D-427). 목록 차례가 AI 우선순위다([임시]) */
  readonly skills: readonly CombatSkill[];
}

export interface BattleSideSpec {
  readonly id: number;
  readonly faction: number;
  readonly defender: boolean;
  readonly edge: Edge;
}

export interface BattlePartySpec {
  readonly id: number;
  readonly side: number;
  /** 퇴각 기준(파티 HP %, ⑦). 0이면 쓰지 않는다 */
  readonly retreatHpPct: number;
}

export interface BattleInit {
  readonly id: number;
  readonly kind: "normal" | "siege";
  readonly seed: number;
  readonly map: BattleMapInput;
  readonly sides: readonly BattleSideSpec[];
  readonly parties: readonly BattlePartySpec[];
  readonly units: readonly CombatUnitSpec[];
  /** 제한 시간(ms). 없으면 종류 기본값(C2) */
  limitMs?: number | undefined;
}

export type Command =
  | { kind: "move"; cell: number }
  | { kind: "attack"; target: number }
  | { kind: "retreat" };

/** 입력(틱 차례, 같은 틱이면 배열 차례): 대기 명령 1칸(D-177·D-180), 참전(파티 단위, D-209) */
export type BattleInput =
  | { readonly tick: number; readonly kind: "command"; readonly unit: number; readonly command: Command }
  | {
      readonly tick: number;
      readonly kind: "join";
      readonly side: BattleSideSpec;
      readonly party: BattlePartySpec;
      readonly units: readonly CombatUnitSpec[];
    };

export type UnitStatus = "alive" | "down" | "retreated";

export interface UnitState extends CombatUnitSpec {
  x: number;
  y: number;
  hp: number;
  armor: number;
  shield: number;
  /** 스태미나·MP 지금 값(×1000, 틱마다 조금씩 차게) */
  staminaMilli: number;
  mpMilli: number;
  status: UnitStatus;
  nextActionMs: number;
  nextMoveMs: number;
  revealUntilMs: number;
  /** 퇴각 구역에 들어간 시각(밖이면 −1) */
  bandSinceMs: number;
  /** 걸린 효과(D-425) */
  effects: ActiveEffect[];
  /** 스킬마다 다시 쓸 수 있는 시각(ms, skills와 같은 차례) */
  skillReadyMs: number[];
  /** 시전 중인 스킬 */
  cast: CastState | null;
  command: Command | null;
  lastCommandMs: number;
  /** 마지막으로 맞은 시각(ms, 피격 뒤 쉴드 재생 지연 D-463 212). 맞은 적이 없으면 아주 작은 값 */
  lastHitMs: number;
}

export interface PartyState extends BattlePartySpec {
  /** 들어올 때 모든 유닛의 최대 HP 합(파티 HP % 분모) */
  maxHpSum: number;
  /** 퇴각 중(퇴각 명령 또는 ⑦ 기준선, D-434). 퇴각 중인 파티만 가장자리 구역으로 빠진다 */
  retreating: boolean;
  retreated: boolean;
}

export interface SideState extends BattleSideSpec {
  /** 지휘관(없으면 0)과 지휘 없음 파티(D-331) */
  commander: number;
  uncommanded: number[];
  /** 지금 보이는 적(틱 시작) */
  visible: number[];
  /** 마지막으로 본 칸(놓친 적 찾기) */
  lastSeen: number[];
}

export interface BattleResult {
  /** 이긴 편 */
  readonly winner: number;
  readonly reason: "nexus" | "wipe" | "timeout";
  readonly endTick: number;
}

export interface BattleState {
  tick: number;
  readonly kind: "normal" | "siege";
  readonly seed: number;
  readonly limitTicks: number;
  units: UnitState[];
  parties: PartyState[];
  sides: SideState[];
  buildings: { id: number; durability: number }[];
  rejected: number;
  result: BattleResult | null;
}

export interface Battle {
  readonly state: BattleState;
  /** 한 틱(그 틱의 입력과 함께) */
  step(inputs: readonly BattleInput[]): void;
  /** 끝날 때까지(또는 maxTicks까지). 입력은 틱 차례로 넣는다 */
  runToEnd(
    inputs: readonly BattleInput[],
    maxTicks?: number,
    onSnapshot?: (snapshot: string, tick: number) => void,
  ): { state: BattleState; result: BattleResult | null; rejected: number };
}
