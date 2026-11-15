// 전투 다시보기(리플레이) 형식 — 서버(sim 기록기)가 만들고 기기(보기 화면)가 읽는다. docs/adr/2026-11-01-battle-replay.md 2절.
// 이 파일은 모양(타입)과 상수다. 이진 부호화는 battleReplayCodec.ts. WebSocket 메시지가 아니라 PROTOCOL_VERSION과 무관하고,
// 형식이 바뀌면 BATTLE_REPLAY_FORMAT_VERSION을 올린다(지형 형식과 같은 규칙).
// 좌표는 전투맵 칸(0 ≤ x, y < 한 변). 유닛은 units 표의 번호(0부터)로 가리킨다. 시각은 틱(tickMs 한 칸).

/**
 * 이진 형식 판. 2 = 움직임 사건(motion·stealth·run·multishot)·스킬 모양 move·키프레임 은신·달리기 표지(docs/adr/2026-11-15-combat-moves.md
 * 5절). 읽기는 1·2를 모두 받는다(1에는 새 사건·표지가 없을 뿐 배치가 같다)
 */
export const BATTLE_REPLAY_FORMAT_VERSION = 2;
/** 읽을 수 있는 가장 옛 판 */
export const BATTLE_REPLAY_MIN_FORMAT_VERSION = 1;
/** 마법 값 "TCBR"(Terra Cognita Battle Replay) */
export const BATTLE_REPLAY_MAGIC = [0x54, 0x43, 0x42, 0x52] as const;
/** 키프레임 기본 간격(틱): 서버 전투 스냅숏과 같은 30초 */
export const REPLAY_KEYFRAME_TICKS = 300;
/** 자원(vitals) 사건 간격(틱): 1초 */
export const REPLAY_VITALS_TICKS = 10;

/** 바라보는 쪽 8방향: 0 북(y 작음) → 시계 방향(1 북동, 2 동, … 7 북서) */
export type Facing = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * 스킬 그림 모양(스킬 ID가 아니라 자료 모양에서, ADR 2절). 스킬 자료에 모양 칸이 있으면 그것(single = strike), 없으면 기록기가
 * 사거리·반지름·대상·회복에서 정한다. 번호(차례)는 이진 형식 코드라 새 모양은 끝에 더한다
 */
export const REPLAY_SKILL_SHAPES = [
  "strike",
  "projectile",
  "area",
  "chain",
  "heal",
  "buff",
  "debuff",
  // 형식 2: 피해 없이 움직이기만 하는 스킬(돌진·도약·점멸·뒷걸음)
  "move",
] as const;
export type ReplaySkillShape = (typeof REPLAY_SKILL_SHAPES)[number];

export const REPLAY_DAMAGE_KINDS = ["physical", "elemental", "none"] as const;
export type ReplayDamageKind = (typeof REPLAY_DAMAGE_KINDS)[number];

export const REPLAY_EFFECT_KINDS = ["buff", "debuff", "dot", "heal", "status"] as const;
export type ReplayEffectKind = (typeof REPLAY_EFFECT_KINDS)[number];

export const REPLAY_END_REASONS = ["nexus", "wipe", "timeout"] as const;
export type ReplayEndReason = (typeof REPLAY_END_REASONS)[number];

export const REPLAY_OUTCOMES = ["hit", "miss", "evade"] as const;
export type ReplayOutcome = (typeof REPLAY_OUTCOMES)[number];

/** 움직임 사건 종류(형식 2): 자기 이동 넷(돌진·도약·점멸·뒷걸음) + 맞은 대상 옮김 둘(밀치기·끌어오기). 번호는 이진 코드 */
export const REPLAY_MOTION_KINDS = ["dash", "leap", "blink", "backstep", "knockback", "pull"] as const;
export type ReplayMotionKind = (typeof REPLAY_MOTION_KINDS)[number];
/** 은신 바뀜 까닭(형식 2): 스킬로 켬·공격으로 깨짐·들킴·끝남 */
export const REPLAY_STEALTH_CAUSES = ["skill", "attack", "detected", "expired"] as const;
export type ReplayStealthCause = (typeof REPLAY_STEALTH_CAUSES)[number];
/** 키프레임 유닛 상태: absent = 아직 들어오지 않음(참전 전) */
export const REPLAY_UNIT_STATUSES = ["alive", "down", "retreated", "absent"] as const;
export type ReplayUnitStatus = (typeof REPLAY_UNIT_STATUSES)[number];

/** 이름(ko·en). 팩 이름이 없으면 없음 */
export interface ReplayName {
  readonly ko: string;
  readonly en: string;
}

export interface ReplayArenaRef {
  /** 2차맵 키(셀 키) */
  readonly mapKey: number;
  /** 지형 주소 판 표지(terrainPath의 v) */
  readonly terrainVersion: string;
  /** 전투맵 (0, 0)이 놓인 2차맵 배치 칸 */
  readonly originX: number;
  readonly originY: number;
}

export interface ReplayBuilding {
  readonly id: number;
  /** 전투맵 칸 번호(y × 한 변 + x), 작은 차례 */
  readonly cells: readonly number[];
  readonly durability: number;
  readonly nexus: boolean;
  /** 성문이면 지나가는 편 ID, 아니면 없음 */
  readonly gateSide: number | null;
}

export interface ReplayArena {
  /** 전투맵 한 변(칸) */
  readonly size: number;
  /** 2차맵 구역이면 그 참조, 빈 평지 등 따로 만든 지도면 없음 */
  readonly ref: ReplayArenaRef | null;
  /** 통과(1 지나감)·엄폐(0·1 수풀·2 막힘) 층, 한 변² */
  readonly passable: Uint8Array;
  readonly cover: Uint8Array;
  readonly buildings: readonly ReplayBuilding[];
}

export interface ReplaySide {
  readonly id: number;
  readonly defender: boolean;
  /** 들어오는 변: 0 북, 1 동, 2 남, 3 서 */
  readonly edge: number;
}

export interface ReplaySkill {
  readonly id: string;
  readonly shape: ReplaySkillShape;
  readonly damage: ReplayDamageKind;
  /** 가장 큰 속성 계수의 속성(0~11), 없으면 −1. 그림 색에 쓴다 */
  readonly element: number;
  readonly range: number;
  readonly radius: number;
  readonly castMs: number;
  readonly name: ReplayName | null;
}

export interface ReplayEffect {
  readonly id: string;
  readonly kind: ReplayEffectKind;
  readonly name: ReplayName | null;
}

export interface ReplayUnit {
  readonly id: number;
  readonly side: number;
  readonly party: number;
  /** 보이는 이름(없으면 빈 글자: 화면이 #ID) */
  readonly name: string;
  /** 종류·역할 코드(화면이 메시지 키로 바꾼다. 모르면 그대로) */
  readonly kind: string;
  /** 들어온 틱(처음부터면 0) */
  readonly joinTick: number;
  readonly x: number;
  readonly y: number;
  readonly facing: Facing;
  readonly maxHp: number;
  readonly armorHp: number;
  readonly shieldHp: number;
  readonly mpMax: number;
  readonly staminaMax: number;
  readonly range: number;
  /** 기본 공격 종류 */
  readonly attack: "physical" | "elemental";
  /** 한 칸 가는 시간(ms): 보기 화면이 걸음 보간에 쓴다 */
  readonly moveIntervalMs: number;
  readonly cyborg: boolean;
  readonly air: boolean;
  /** 쓸 수 있는 스킬(스킬 표 번호) */
  readonly skills: readonly number[];
}

export interface ReplayUnitEffect {
  /** 효과 표 번호 */
  readonly effect: number;
  readonly stacks: number;
  /** 끝나는 틱(전투 내내면 −1) */
  readonly untilTick: number;
}

export interface ReplayUnitFrame {
  readonly status: ReplayUnitStatus;
  readonly x: number;
  readonly y: number;
  readonly facing: Facing;
  readonly hp: number;
  readonly armor: number;
  readonly shield: number;
  /** MP·스태미나(정수 점, 밀리점을 버림) */
  readonly mp: number;
  readonly stamina: number;
  readonly effects: readonly ReplayUnitEffect[];
  /** 시전 중이면 {스킬 표 번호, 목표 유닛 번호, 끝나는 틱} */
  readonly cast: { readonly skill: number; readonly target: number; readonly endTick: number } | null;
  /** 은신 중·달리는 중(형식 2, 켜졌을 때만 칸이 있다) */
  readonly stealth?: true | undefined;
  readonly running?: true | undefined;
}

export interface ReplayKeyframe {
  /** 이 틱 처음(그 틱의 사건 전) 상태 */
  readonly tick: number;
  /** units 표 차례 */
  readonly units: readonly ReplayUnitFrame[];
}

/** 맞은 결과(공격·스킬): 맞은 뒤 대상 체력·아머·쉴드까지 */
export interface ReplayHit {
  readonly outcome: ReplayOutcome;
  readonly crit: boolean;
  readonly physical: number;
  readonly elemental: number;
  readonly hp: number;
  readonly armor: number;
  readonly shield: number;
}

/** 사건(틱 차례). u·target은 유닛 번호, skill·effect는 표 번호 */
export type ReplayEvent =
  | {
      readonly k: "move";
      readonly t: number;
      readonly u: number;
      readonly x: number;
      readonly y: number;
      readonly facing: Facing;
    }
  | ({
      readonly k: "attack";
      readonly t: number;
      readonly u: number;
      readonly target: number;
      readonly facing: Facing;
    } & ReplayHit)
  | {
      readonly k: "building";
      readonly t: number;
      readonly u: number;
      readonly building: number;
      readonly damage: number;
      readonly durability: number;
    }
  | {
      readonly k: "cast";
      readonly t: number;
      readonly u: number;
      readonly skill: number;
      readonly target: number;
      readonly endTick: number;
    }
  | {
      readonly k: "skill";
      readonly t: number;
      readonly u: number;
      readonly skill: number;
      readonly target: number;
      readonly x: number;
      readonly y: number;
      readonly facing: Facing;
    }
  | ({
      readonly k: "skillHit";
      readonly t: number;
      readonly u: number;
      readonly skill: number;
      readonly target: number;
    } & ReplayHit)
  | { readonly k: "fizzle"; readonly t: number; readonly u: number; readonly skill: number }
  | { readonly k: "interrupt"; readonly t: number; readonly u: number; readonly skill: number }
  /** 원거리 공격·스킬이 맞는 틱(skill −1 = 기본 공격). 보기 화면은 이 틱에 닿게 그린다 */
  | {
      readonly k: "projectile";
      readonly t: number;
      readonly u: number;
      readonly target: number;
      readonly skill: number;
    }
  /**
   * 회복: u = 회복시킨 유닛(효과 주기 회복이면 −1), effect = 효과 표 번호(스킬 회복이면 −1). amount = 오른 체력, shieldGain = 채운 쉴드,
   * hp·shield = 회복 뒤 값(쉴드 회복 스킬이 생기면 같은 사건에 싣는다)
   */
  | {
      readonly k: "heal";
      readonly t: number;
      readonly u: number;
      readonly target: number;
      readonly amount: number;
      readonly hp: number;
      readonly shieldGain: number;
      readonly shield: number;
      readonly effect: number;
    }
  | {
      readonly k: "dot";
      readonly t: number;
      readonly target: number;
      readonly effect: number;
      readonly amount: number;
      readonly hp: number;
    }
  | {
      readonly k: "effectOn";
      readonly t: number;
      readonly target: number;
      readonly effect: number;
      readonly stacks: number;
      readonly untilTick: number;
    }
  | { readonly k: "effectOff"; readonly t: number; readonly target: number; readonly effect: number }
  | { readonly k: "down"; readonly t: number; readonly u: number }
  | { readonly k: "retreat"; readonly t: number; readonly u: number }
  | {
      readonly k: "vitals";
      readonly t: number;
      readonly u: number;
      readonly hp: number;
      readonly armor: number;
      readonly shield: number;
      readonly mp: number;
      readonly stamina: number;
    }
  /** 편 side에게 유닛 u가 보이기 시작(on)·놓침 */
  | {
      readonly k: "vision";
      readonly t: number;
      readonly side: number;
      readonly u: number;
      readonly on: boolean;
    }
  | { readonly k: "end"; readonly t: number; readonly winner: number; readonly reason: ReplayEndReason }
  /**
   * 형식 2. 움직임 부품이 유닛을 옮겼다: from → (x, y). 점멸은 앞 칸에서 사라져 새 칸에 나타난다. 이 틱의 걸음 사건은 따로 싣지 않는다.
   * facing = 옮긴 뒤 바라보는 쪽(뒷걸음·밀치기·끌어오기는 그대로)
   */
  | {
      readonly k: "motion";
      readonly t: number;
      readonly u: number;
      readonly kind: ReplayMotionKind;
      readonly fromX: number;
      readonly fromY: number;
      readonly x: number;
      readonly y: number;
      readonly facing: Facing;
    }
  /** 형식 2. 은신 켜짐·꺼짐 */
  | {
      readonly k: "stealth";
      readonly t: number;
      readonly u: number;
      readonly on: boolean;
      readonly cause: ReplayStealthCause;
    }
  /** 형식 2. 달리기 켜짐·꺼짐 */
  | { readonly k: "run"; readonly t: number; readonly u: number; readonly on: boolean }
  /** 형식 2. 연사: 대상 하나에 shots발(뒤따르는 skillHit이 발마다 하나) */
  | {
      readonly k: "multishot";
      readonly t: number;
      readonly u: number;
      readonly target: number;
      readonly skill: number;
      readonly shots: number;
    };

export type ReplayEventKind = ReplayEvent["k"];
/** 사건 종류 번호(이진 형식). 한 번 쓴 번호는 다른 뜻으로 다시 쓰지 않는다 */
export const REPLAY_EVENT_KINDS = [
  "move",
  "attack",
  "building",
  "cast",
  "skill",
  "skillHit",
  "fizzle",
  "interrupt",
  "projectile",
  "heal",
  "dot",
  "effectOn",
  "effectOff",
  "down",
  "retreat",
  "vitals",
  "vision",
  "end",
  // 형식 2
  "motion",
  "stealth",
  "run",
  "multishot",
] as const satisfies readonly ReplayEventKind[];

export interface ReplayResult {
  readonly winner: number;
  readonly reason: ReplayEndReason;
  readonly endTick: number;
}

export interface BattleReplay {
  readonly formatVersion: number;
  /** 기록한 판정 판(@terra/sim SIM_VERSION) */
  readonly simVersion: number;
  readonly seed: number;
  readonly tickMs: number;
  readonly kind: "normal" | "siege";
  readonly limitTicks: number;
  readonly result: ReplayResult;
  readonly arena: ReplayArena;
  readonly sides: readonly ReplaySide[];
  readonly skills: readonly ReplaySkill[];
  readonly effects: readonly ReplayEffect[];
  readonly units: readonly ReplayUnit[];
  /** 처음(틱 0) + keyframe 간격마다. 틱 차례 */
  readonly keyframes: readonly ReplayKeyframe[];
  /** 틱 차례(같은 틱이면 일어난 차례) */
  readonly events: readonly ReplayEvent[];
}

/**
 * 두 칸 사이 방향(같은 칸이면 fallback). 한쪽 차이가 다른 쪽의 두 배를 넘으면 곧은 방향, 아니면 대각선(정수 비교만)
 */
export function facingBetween(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  fallback: Facing,
): Facing {
  const ax = Math.abs(toX - fromX);
  const ay = Math.abs(toY - fromY);
  const dx = ay > ax * 2 ? 0 : Math.sign(toX - fromX);
  const dy = ax > ay * 2 ? 0 : Math.sign(toY - fromY);
  if (dx === 0 && dy === 0) return fallback;
  if (dx === 0) return dy < 0 ? 0 : 4;
  if (dy === 0) return dx > 0 ? 2 : 6;
  if (dx > 0) return dy < 0 ? 1 : 3;
  return dy < 0 ? 7 : 5;
}
