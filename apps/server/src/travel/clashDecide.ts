// 조우 AI 판단(순수) — 기획 D-570(질문 1904 원문 "무조건 전투가 아니라 현재 전투세팅상태나 전력차, 성향에 따라 판정됨, 일정거리내에 유닛이나
// 분대 등이 포함될시 ai 판단계산 회피 또는 약탈"), docs/adr/2026-11-15-unloaded-second-maps.md "바뀜 (D-570, 좌표 이동 3)"·"바뀜 (encounter-4)".
// 편마다 따로 판단한다:
// - 회피(avoid) = 먼저 걸지 않는다. 두 편이 모두 회피하면 아무 일도 없다(쉬는 시간 동안 그 짝을 다시 보지 않는다).
// - 바뀜 (encounter-4, 질문 2021·2023 답 — D-570 1904·1908, D-174, D-5039·D-5040, D-144): 판단 입력 = 그 편의 AI 작전(@terra/shared/aiTactics).
//   플레이어 유닛은 유닛마다 저장한 작전(없으면 균형 프리셋), NPC는 성격(공격 성향 D-327) → 프리셋(npcPresetOf) — NPC도 같은 슬라이더.
//   ① 교전 n: 조우 = 기회 하나, n × 10% 확률(C40, 서버 난수 한 번)로 걸어 볼 마음을 먹는다. 그다음 전력 비 문턱(① 교전이 문턱을 옮긴다 —
//   교전 5 = 그대로, 0 = 문턱 × (1 + 0.5 × encounter_aggression_pm ÷ 1000), 10 = × (1 − 0.5 × …)).
//   ⑦ 퇴각 기준: 편 남은 HP가 그 선 아래면 걸지 않는다(전투 몸을 셀 수 있을 때 — 띄운 2차맵).
//   오프라인 플레이어 유닛·직무 중 유닛은 먼저 걸지 않는다(D-144 — 부르는 쪽이 starters를 센다).
// - 전쟁 중인 상대: 전력 비(내 전력 × 1000 ÷ 상대 전력) ≥ 문턱이면 전투(fight).
// - 전쟁이 아닌 다른 나라: 상대가 짐을 지녔고 전력 비 ≥ 약탈 문턱이면 약탈(loot). 짐이 없으면 회피(빼앗을 것이 없다). 약탈 전투는 전쟁 전투가
//   아니라 진 유닛은 포로가 아니라 안전한 곳으로 가고, 이긴 편이 진 유닛 짐 몫을 가져간다(D-173 탈취 — 세계 전투 결과 적용 그대로).
// - 설정 칸 encounter_player_policy: 0 = 플레이어 늘 회피(옛 기본), 1 = 성향 500 NPC처럼(옛, 굴림 없음), 2 = AI 작전대로(지금 기본).
// - 둘 다 걸면 전력 비가 큰 편이 공격 편(같으면 앞 편). 공격 편은 전투맵 시간이 다 되면 진다(D-210 — 수비 = 습격당한 쪽).
// - 회피 편 빠져나가기(D-573, 질문 2022 나): 한쪽만 걸고 다른 쪽이 판단 끝에 회피했으면(판단 유닛이 있는 편) 걷기 빠르기(가장 느린 유닛 —
//   실효 AGI·이동 버프, world/walkSpeed.ts)를 견준다. 회피 편이 더 빠르면 전투 없이 빠져나가고(escaped), 아니면 조우 전투가 열리고 그 편은
//   전투맵에서 퇴각을 시도한다(flee — 시작 틱에 파티 퇴각 명령, D-190 퇴각 규칙). 판단 유닛이 없는 편(봇만)은 빠져나가지 않고 맞선다(2024 가).
// - 바뀜(misc-574, 기획 대조 질문 2224 — D-558 1547 "파티도 없으면 유닛들 개별 참전"): 편 평균으로 한 번 판단하지 않는다. 편 안의 판단 묶음(파티·분대는
//   그 파티 설정, 파티 없는 유닛은 유닛마다 — 지금 세계에는 파티 묶음이 없어 모두 유닛마다)이 저마다 자기 작전(① 교전 굴림·⑦ 퇴각 기준·남은 HP)과
//   접속(D-574 2140 — 그 유닛 소유주)으로 판단하고, 하나라도 걸면 그 편이 건다(전력 비는 편 전체 — 함께 선 편이 같이 싸운다). 모두 회피면 회피.
//   공격 편에는 건 묶음의 유닛만 든다(engagedUnits — 질문 2224 나: 걸지 않은 유닛은 하던 길을 간다, 판단하지 않는 봇은 함께 든다). 수비 편은 모두 든다.
import type { EncounterCoefficients } from "@terra/sim";

export type ClashChoice = "avoid" | "loot" | "fight";

/** 편 안의 판단 묶음 하나(파티·분대 또는 파티 없는 유닛 하나 — 질문 2224) */
export interface ClashGroupView {
  /** 플레이어가 움직이는 묶음인가(아니면 NPC) */
  readonly player: boolean;
  /** 먼저 걸 수 있나(NPC, 또는 소유주가 접속 중인 플레이어 — D-144·D-574) */
  readonly starter: boolean;
  /** AI 작전 ① 교전(0~10)·⑦ 퇴각 기준(%) */
  readonly engage: number;
  readonly retreatPct: number;
  /** 남은 HP(%, 전투 몸으로 셀 수 있을 때만) */
  readonly hpPct?: number | undefined;
  /** ① 교전 굴림(0 이상 1000 미만 — 묶음마다 따로) */
  readonly rollPm: number;
  /** 그 묶음의 유닛(공격 편에 드는 유닛 고르기 — engagedUnits). 없으면 빈 묶음 */
  readonly unitIds?: readonly number[] | undefined;
}

/** 판단에 드는 한 편의 값 */
export interface ClashSideView {
  /** 판단하는 유닛 수(0이면 늘 회피) */
  readonly deciders: number;
  /** 먼저 걸 수 있는 판단 유닛 수(NPC + 접속 중인 플레이어 — D-144). 없으면 deciders와 같다 */
  readonly starters?: number | undefined;
  /** 플레이어가 움직이는 편인가(아니면 NPC) */
  readonly player: boolean;
  /** 편 AI 작전 ① 교전(0~10, 판단 유닛 평균). 옛 정책 1(성향 500)은 5로 본다 */
  readonly engage: number;
  /** 편 AI 작전 ⑦ 퇴각 기준(파티 HP %, 판단 유닛 평균) */
  readonly retreatPct: number;
  /** 편 남은 HP(%, 전투 몸으로 셀 수 있을 때만) */
  readonly hpPct?: number | undefined;
  /** 편 전력(clashPower 합) */
  readonly power: number;
  /** 짐을 지녔나(약탈 거리) */
  readonly carries: boolean;
  /** 편 걷기 빠르기(가장 느린 유닛, 단위/초). 모르면 0(빠져나가지 못한다) */
  readonly speed?: number | undefined;
  /** 판단 묶음(질문 2224). 있으면 묶음마다 판단하고 위 평균 칸(engage·retreatPct·hpPct·starters)은 쓰지 않는다 */
  readonly groups?: readonly ClashGroupView[] | undefined;
}

export type EncounterRules = Pick<
  EncounterCoefficients,
  "warRatioPm" | "lootRatioPm" | "aggressionPm" | "playerPolicy"
>;

/** 교전 중간값(성향 500과 같은 자리) */
const NEUTRAL_ENGAGE = 5;
/** 설정 칸 encounter_player_policy 값 */
export const PLAYER_POLICY_AVOID = 0;
export const PLAYER_POLICY_NEUTRAL = 1;
export const PLAYER_POLICY_TACTICS = 2;

/** 성향을 반영한 문턱(‰). aggression = 0~1000(교전 n은 n × 100) */
export function clashThreshold(base: number, aggression: number, aggressionPm: number): number {
  const shift = Math.floor(((500 - aggression) * aggressionPm) / 1000);
  return Math.max(0, Math.floor((base * (1000 + shift)) / 1000));
}

/** 전력 비(‰). 상대 전력이 0이면 큰 값 */
export function powerRatioPm(mine: number, theirs: number): number {
  if (theirs <= 0) return mine > 0 ? Number.MAX_SAFE_INTEGER : 0;
  return Math.floor((mine * 1000) / theirs);
}

/**
 * 한 편의 판단. rollPm = 0 이상 1000 미만 난수(① 교전 굴림 — 기회 하나에 한 번). 옛 정책 1(성향 500 NPC처럼)은 굴리지 않는다
 */
export function decideClash(
  me: ClashSideView,
  them: ClashSideView,
  atWar: boolean,
  rules: EncounterRules,
  rollPm = 0,
): ClashChoice {
  if (me.groups && me.deciders > 0) {
    for (const group of me.groups) {
      const view: ClashSideView = {
        deciders: 1,
        starters: group.starter ? 1 : 0,
        player: group.player,
        engage: group.engage,
        retreatPct: group.retreatPct,
        hpPct: group.hpPct,
        power: me.power,
        carries: me.carries,
      };
      const choice = decideClash(view, them, atWar, rules, group.rollPm);
      if (choice !== "avoid") return choice;
    }
    return "avoid";
  }
  if (me.deciders <= 0 || (me.starters ?? me.deciders) <= 0) return "avoid";
  const neutral = me.player && rules.playerPolicy === PLAYER_POLICY_NEUTRAL;
  if (me.player && !neutral && rules.playerPolicy !== PLAYER_POLICY_TACTICS) return "avoid";
  if (!atWar && !them.carries) return "avoid";
  const engage = neutral ? NEUTRAL_ENGAGE : Math.min(10, Math.max(0, me.engage));
  if (!neutral) {
    if (me.hpPct !== undefined && me.hpPct < me.retreatPct) return "avoid";
    if (rollPm >= engage * 100) return "avoid";
  }
  const need = clashThreshold(atWar ? rules.warRatioPm : rules.lootRatioPm, engage * 100, rules.aggressionPm);
  if (powerRatioPm(me.power, them.power) < need) return "avoid";
  return atWar ? "fight" : "loot";
}

/** 그 편에서 건 묶음의 유닛(질문 2224 — 공격 편에 드는 판단 유닛). 묶음이 없으면 undefined(편 전체) */
export function engagedUnits(
  me: ClashSideView,
  them: ClashSideView,
  atWar: boolean,
  rules: EncounterRules,
): Set<number> | undefined {
  if (!me.groups) return undefined;
  const out = new Set<number>();
  for (const group of me.groups) {
    const view: ClashSideView = {
      deciders: 1,
      starters: group.starter ? 1 : 0,
      player: group.player,
      engage: group.engage,
      retreatPct: group.retreatPct,
      hpPct: group.hpPct,
      power: me.power,
      carries: me.carries,
    };
    if (decideClash(view, them, atWar, rules, group.rollPm) !== "avoid")
      for (const unitId of group.unitIds ?? []) out.add(unitId);
  }
  return out;
}

export interface ClashResolution {
  /** 공격 편(0 = 앞 편, 1 = 뒤 편) */
  readonly attacker: 0 | 1;
  readonly choice: "loot" | "fight";
  /** 두 편의 판단(기록) */
  readonly choices: readonly [ClashChoice, ClashChoice];
  /** 수비 편이 판단 끝에 회피했다(D-573 — 빠르면 escaped, 아니면 전투맵에서 퇴각 시도) */
  readonly flee: boolean;
  /** 회피 편이 더 빨라 전투 없이 빠져나갔다(전투를 열지 않는다) */
  readonly escaped: boolean;
}

/** 두 편 판단을 모아 싸움이 나는지. 둘 다 회피면 null. rolls = 두 편의 ① 교전 굴림(‰) */
export function resolveClash(
  a: ClashSideView,
  b: ClashSideView,
  atWar: boolean,
  rules: EncounterRules,
  rolls: readonly [number, number] = [0, 0],
): ClashResolution | null {
  const first = decideClash(a, b, atWar, rules, rolls[0]);
  const second = decideClash(b, a, atWar, rules, rolls[1]);
  if (first === "avoid" && second === "avoid") return null;
  let attacker: 0 | 1;
  if (first === "avoid") attacker = 1;
  else if (second === "avoid") attacker = 0;
  else attacker = powerRatioPm(b.power, a.power) > powerRatioPm(a.power, b.power) ? 1 : 0;
  const choice = attacker === 0 ? first : second;
  const defender = attacker === 0 ? b : a;
  const flee = (attacker === 0 ? second : first) === "avoid" && defender.deciders > 0;
  const fast = (side: ClashSideView): number => Math.max(0, side.speed ?? 0);
  const attackerSide = attacker === 0 ? a : b;
  const escaped = flee && fast(attackerSide) > 0 && fast(defender) > fast(attackerSide);
  return { attacker, choice: choice === "avoid" ? "fight" : choice, choices: [first, second], flee, escaped };
}

/** 전투 몸 하나의 전력: (남은 HP + 아머 + 쉴드) × 공격력 × 1000 ÷ 공격 간격 */
export function clashPower(spec: {
  readonly maxHp: number;
  readonly armorHp: number;
  readonly shieldHp: number;
  readonly start?: { readonly hp: number; readonly armor: number; readonly shield: number } | undefined;
  readonly attack: { readonly statAttack: number; readonly weaponAttack: number };
  readonly attackIntervalMs: number;
}): number {
  const life = spec.start
    ? spec.start.hp + spec.start.armor + spec.start.shield
    : spec.maxHp + spec.armorHp + spec.shieldHp;
  const attack = Math.max(0, spec.attack.statAttack + spec.attack.weaponAttack);
  return Math.floor((Math.max(0, life) * attack * 1000) / Math.max(1, spec.attackIntervalMs));
}
