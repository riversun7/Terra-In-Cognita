// 전투 판정 타입 — battle.ts가 쓰는 사양·상태·결과 모양(직렬화할 수 있는 값만). docs/adr/2026-10-31-combat-core.md
import type { BattleMapInput } from "./battleMap.ts";
import type { CommandRank } from "./command.ts";
import type { ActiveEffect, ModifierStat } from "./effects.ts";
import type { AttackProfile, DefenseProfile } from "./formula.ts";
import type { FormationShape } from "./formation.ts";
import type { CastState, CombatSkill } from "./skills.ts";
import type { Tactic } from "./tactics.ts";

/** 편의 가장자리(들어오는 변): 0 북(y 작음), 1 동, 2 남, 3 서 */
export type Edge = 0 | 1 | 2 | 3;

/**
 * 전투 전에 걸려 있던 버프·디버프 하나(아이템 사용 효과 D-501 — 서버 표 unit_effects). 판정의 걸린 효과(effects.ts ActiveEffect)로
 * 들어가 효과 합(modifiersOf·moveIntervalMs·shieldRegenPerMinute)이 그대로 읽는다(새 식 없음). untilMs = 전투 시각(처음 0) 기준 끝나는
 * 시각(ms), 0 이하면 넣지 않는다. 1차 스탯 버프는 여기가 아니라 사양을 만들 때 1차 스탯에 든다(48 §2.3)
 */
export interface StartEffect {
  readonly id: string;
  readonly kind: "buff" | "debuff";
  readonly stat: ModifierStat;
  readonly valueMode: "flat" | "permille";
  readonly value: number;
  readonly untilMs: number;
}

/**
 * 전투에 가지고 들어온 물약 하나(287, D-509·D-510 — 서버가 그 유닛이 든 보유 물건에서 만든다). 판정은 HP가 문턱 아래로 떨어지면
 * 쿨이 끝났을 때 모자란 HP를 가장 덜 넘치게 채우는 것을 마신다(스태미나 없음, 행동 시각과 따로). 양은 서버가 굴림 가운데 값·신선도·
 * ‰ 회복(최대 HP 기준)으로 미리 셈한 정수다(판정은 굴리지 않는다)
 */
export interface BattlePotion {
  /** 보유 물건 칸 ID(결과에 쓴 수를 돌려준다) */
  readonly id: number;
  /** 가지고 들어온 수 */
  readonly count: number;
  /** 한 번에 채우는 HP */
  readonly instant: number;
  /** 주기 회복 줄(효과 사전 heal, 주기 > 0): 효과 ID·주기마다 양·주기·지속 */
  readonly over?:
    | readonly {
        readonly effect: string;
        readonly amount: number;
        readonly tickMs: number;
        readonly durationMs: number;
      }[]
    | undefined;
}

/** 전투 자동 물약(D-510): 가진 물약, HP 문턱(‰, AI 작전 슬라이더 D-5039 — 지금은 설정 칸), 물약 쿨(D-509 30초), 처음 쓸 수 있는 전투 시각 */
export interface BattlePotions {
  readonly items: readonly BattlePotion[];
  readonly thresholdPm: number;
  readonly cooldownMs: number;
  /** 전투 밖에서 걸린 물약 쿨이 남았으면 그 끝(전투 시각 ms), 아니면 0 */
  readonly readyMs: number;
}

export interface CombatUnitSpec {
  readonly id: number;
  readonly side: number;
  readonly party: number;
  readonly x: number;
  readonly y: number;
  readonly maxHp: number;
  readonly armorHp: number;
  readonly shieldHp: number;
  /**
   * 들어올 때의 HP·아머 HP·쉴드 HP(D-512: 전투가 끝나도 남은 값으로 다음 전투를 시작한다). 칸마다 0~최대로 자른다. HP 0이면 쓰러진
   * 채 들어온다(D-099). 없으면 모두 가득(옛 시작 자료·시뮬레이터와 같다)
   */
  readonly start?: { readonly hp: number; readonly armor: number; readonly shield: number } | undefined;
  /**
   * 들어올 때 걸려 있는 효과(아이템 버프 D-501, unit_effects). 칸 차례로 걸린 효과에 넣는다. 없으면 걸린 효과 없이 시작한다(옛 시작
   * 자료·시뮬레이터와 같다)
   */
  readonly startEffects?: readonly StartEffect[] | undefined;
  readonly attack: AttackProfile;
  /**
   * 스킬 기반별 공격 사양(D-463 211): 물리 = 든 무기의 물리 칸·물리 공격력, 속성 = 든 무기의 속성 칸·속성 공격력. 든 무기에 그 칸이
   * 없으면 그 기반의 스킬은 쓸 수 없다(D-490, weaponFields). 없으면 기본 공격 사양(attack)으로 푼다(시험 유닛)
   */
  readonly skillAttack?: { readonly physical: AttackProfile; readonly elemental: AttackProfile } | undefined;
  /**
   * 스킬에 쓸 수 있는 든 무기의 공격력 칸(D-490): 맨손이면 빈 목록(타고난 무기를 무기로 치는 종류는 타고난 무기의 칸).
   * 스킬은 이 목록에 필요한 칸이 있을 때만 쓴다(skills.ts skillUsable, 맨손 스킬 제외). 없으면(시험 유닛·옛 스냅숏) 모든 스킬을 쓴다
   */
  readonly weaponFields?: readonly ("physical" | "elemental")[] | undefined;
  /** 맨손 스킬의 공격 사양(D-490): 타고난 무기(물리)·맨손 속성 자료(속성)와 2차 공격력. 없으면 skillAttack */
  readonly bareHandAttack?:
    | { readonly physical: AttackProfile; readonly elemental: AttackProfile }
    | undefined;
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
  /** STA 점수(N13: 1차 AGI·VIT 가중합). 적정 STA와 함께 소모 배율을 정한다 */
  readonly staminaScore: number;
  /**
   * 적정 STA 점수(밀리점, D-511 계산식 stamina_appropriate, 유닛 레벨). 소모 = 기본 × max(최소, 적정 ÷ 점수).
   * 없으면(시험 유닛·옛 스냅숏) STA 점수와 같다(배율 1)
   */
  readonly staminaAppropriateMilli?: number | undefined;
  /** 스태미나 회복(분당, 2차 스탯 stamina_regen × 적정 비율 — 계산식 real_stamina_regen, D-511) */
  readonly staminaRegen: number;
  readonly mpMax: number;
  readonly mpCost: number;
  /** MP 회복(분당, 2차 스탯 mp_regen D-458) */
  readonly mpRegen: number;
  /** 쉴드 재생(분당, 2차 스탯 shield_regen D-458). 맞는 중에도 일정하게 찬다(D-490). 쉴드 재생 효과(shield_regen ‰)가 바꾼다 */
  readonly shieldRegen: number;
  /** HP 회복(분당, 2차 스탯 hp_regen D-514). 전투 중에도 쉴드처럼 일정하게 찬다(산 유닛만). 없으면 0(옛 시작 자료·시험 유닛) */
  readonly hpRegen?: number | undefined;
  /** 아머 회복(분당, 최대 아머 HP × 설정 칸 n54_armor_regen ‰, D-514 "쉴드처럼"). 없으면 0 */
  readonly armorRegen?: number | undefined;
  /**
   * 남은 탄(287, D-497: 든 무기가 탄약 종류를 쓰면 보조 칸 탄약 장비의 내구도). 기본 공격 한 번에 1 쓰고, 0이면 기본 공격을 못 한다.
   * 없으면 탄을 쓰지 않는 무기(옛 시작 자료·시뮬레이터와 같다)
   */
  readonly ammo?: number | undefined;
  /** 전투 자동 물약(287, D-510). 없으면 물약 없음 */
  readonly potions?: BattlePotions | undefined;
  /** 스탯 시야(칸, 가중치 표 sight 행) */
  readonly sight: number;
  /** 시선 높이(16배 cm) */
  readonly eye: number;
  readonly air: boolean;
  /** 지휘 정원(파티 수, D-179·C7 — D-558 작위·전투 랭킹·환생) */
  readonly commandCap: number;
  /**
   * 지휘 계급(D-558 1545 승계 순서 — 국가 작위 → 전투 랭킹). 작위·랭킹이 없는 유닛(NPC 휴먼·크리쳐·옛 시작 자료)은 칸이 없다(옛 선출:
   * 정원 → ID)
   */
  readonly commandRank?: CommandRank | undefined;
  readonly cyborg: boolean;
  /** 건물 피해 배율(천분율, C32) */
  readonly buildingMulPm: number;
  /** 1차 스탯 6개(STR·DEX·AGI·VIT·INT·WIS, 장비 포함): 상태이상 저항(D-429)에 쓴다 */
  readonly primaries: readonly number[];
  /**
   * 몸 밀림 저항(‰, D-564 1588·1807 "보스는 덜 밀림"): 보스 등급이 더한다(curves.ts bodyDisplaceResistPm). 스탯 몫(VIT, 효과 사전 밀림
   * 상태이상 항목)은 판정이 더한다. 0이면 칸을 두지 않는다(옛 시작 자료·상태 JSON 그대로)
   */
  readonly displaceResistPm?: number | undefined;
  /** 몸 크기 거리 배율(‰, D-570: S 더 · L 덜 · XL 훨씬 덜, curves.ts bodyDisplaceSizePm). 1000(크기 M·없음)이면 칸을 두지 않는다 */
  readonly displaceSizePm?: number | undefined;
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

/**
 * 유닛 대기 명령(D-177·D-180). run = 달리며 가기(docs/adr/2026-11-15-combat-moves.md 1절, AI 고리 wantsRun — 프로토콜은 아직 싣지 않는다,
 * 뒤 작업 WP-5). 없으면 걷는다(옛 명령 그대로)
 */
export type Command =
  | { kind: "move"; cell: number; run?: boolean | undefined }
  | { kind: "attack"; target: number; run?: boolean | undefined }
  | { kind: "retreat" };

/**
 * 파티·군단 명령(기획 D-545·D-549, orders.ts). 유닛 대기 명령(D-180) 위층이다: 내리면 그 유닛들의 대기 명령을 비우고(채운다), 그 뒤 유닛
 * 명령이 들어온 유닛은 유닛 명령을 먼저 따른다(끝나면 다시 파티 명령). advance = 진형을 지키며 전진(cell이 있으면 그 칸으로 지금 모양 그대로,
 * 없으면 적 쪽으로), hold = 자리 지키기(움직이지 않고 닿는 적만), attack = 목표 공격(target 유닛을 모두 친다, 쓰러지면 명령이 끝난다),
 * retreat = 파티 퇴각(D-205·D-6025), free = 명령을 거두고 AI 작전으로
 */
export type PartyOrderInput =
  | { readonly kind: "advance"; readonly cell?: number | undefined }
  | { readonly kind: "hold" }
  | { readonly kind: "attack"; readonly target: number }
  | { readonly kind: "retreat" }
  | { readonly kind: "free" }
  /** 집결(D-558): 그 칸(없으면 군단 = 지휘관 자리, 파티 = 파티 가운데)에 대형으로 모여 선다 */
  | { readonly kind: "rally"; readonly cell?: number | undefined }
  /** 따라가기(D-558): 같은 편 다른 파티 뒤를 대형으로 따라간다(그 파티가 없어지면 명령이 끝난다) */
  | { readonly kind: "follow"; readonly party: number }
  /** 대형 고르기(D-558·D-172): 대형을 바꾸고 그 자리에서 다시 선다(뒤 집결·따라가기도 이 대형) */
  | { readonly kind: "formation"; readonly shape: FormationShape }
  /** AI 전개 방식(D-558 2차, tactics.ts) */
  | { readonly kind: "tactic"; readonly tactic: Tactic };

/** 파티가 들고 있는 명령(상태 — 직렬화되는 값만). legion = 군단 명령으로 받았나(진형 묶음이 편 전체) */
export type PartyOrder =
  | {
      readonly kind: "advance";
      readonly legion: boolean;
      /** 칸으로 전진할 때 유닛마다 자리 칸(내릴 때의 모양 그대로 옮긴 칸) */
      readonly slots?: readonly { readonly unit: number; readonly cell: number }[] | undefined;
    }
  | { readonly kind: "hold"; readonly legion: boolean }
  | { readonly kind: "attack"; readonly legion: boolean; readonly target: number }
  /** 집결·대형 고르기: 유닛마다 설 칸(서서 닿는 적만 친다) */
  | {
      readonly kind: "rally";
      readonly legion: boolean;
      readonly slots: readonly { readonly unit: number; readonly cell: number }[];
    }
  /** 따라가기: 앞 파티 ID(설 칸은 틱마다 그 파티 뒤로 다시 센다) */
  | { readonly kind: "follow"; readonly legion: boolean; readonly party: number }
  /** 전개 방식. 수비 집중은 내릴 때 유닛마다 닻 칸(slots) */
  | {
      readonly kind: "tactic";
      readonly legion: boolean;
      readonly tactic: Tactic;
      readonly slots?: readonly { readonly unit: number; readonly cell: number }[] | undefined;
    };

/**
 * 입력(틱 차례, 같은 틱이면 배열 차례): 대기 명령 1칸(D-177·D-180), 참전(파티 단위, D-209), 파티 명령·군단 명령(D-549 — 군단 명령은
 * 지휘관 정원 안 파티만 받는다, 1463)
 */
export type BattleInput =
  | { readonly tick: number; readonly kind: "command"; readonly unit: number; readonly command: Command }
  | { readonly tick: number; readonly kind: "order"; readonly party: number; readonly order: PartyOrderInput }
  | { readonly tick: number; readonly kind: "legion"; readonly side: number; readonly order: PartyOrderInput }
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
  /** 남은 탄(사양에 ammo가 있을 때만, 287) */
  ammoLeft?: number;
  /** 물약마다 남은 수(사양 potions.items 차례)·다시 마실 수 있는 시각(사양에 potions가 있을 때만, 287) */
  potionsLeft?: number[];
  potionReadyMs?: number;
  /**
   * 움직임 상태(docs/adr/2026-11-15-combat-moves.md, moves.ts). 켜졌을 때만 칸이 있다(안 쓰는 전투의 상태 JSON이 그대로):
   * running = 달리는 중, stealthUntilMs = 은신이 끝나는 시각(공격·들킴으로 먼저 깨진다), detectUntilMs·detectCells = 감지 부품
   */
  running?: true | undefined;
  stealthUntilMs?: number | undefined;
  detectUntilMs?: number | undefined;
  detectCells?: number | undefined;
}

export interface PartyState extends BattlePartySpec {
  /** 들어올 때 모든 유닛의 최대 HP 합(파티 HP % 분모) */
  maxHpSum: number;
  /** 퇴각 중(퇴각 명령 또는 ⑦ 기준선, D-434). 퇴각 중인 파티만 가장자리 구역으로 빠진다 */
  retreating: boolean;
  retreated: boolean;
  /** 파티·군단 명령(D-549). 명령을 받은 적이 없으면 칸이 없다(옛 상태 모양 그대로) */
  order?: PartyOrder | undefined;
  /** 마지막으로 파티 명령을 받은 시각(ms, 다시 넣기 막기 — C5와 같은 시간). 받은 적이 없으면 칸이 없다 */
  orderMs?: number | undefined;
  /** 고른 대형(D-558 대형 고르기). 고른 적이 없으면 칸이 없다(집결·따라가기는 방진) */
  shape?: FormationShape | undefined;
}

export interface SideState extends BattleSideSpec {
  /** 지휘관(없으면 0)과 지휘 없음 파티(D-331) */
  commander: number;
  uncommanded: number[];
  /** 지금 보이는 적(틱 시작) */
  visible: number[];
  /** 마지막으로 본 칸(놓친 적 찾기) */
  lastSeen: number[];
  /** 마지막으로 군단 명령을 받은 시각(ms). 받은 적이 없으면 칸이 없다 */
  orderMs?: number | undefined;
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
