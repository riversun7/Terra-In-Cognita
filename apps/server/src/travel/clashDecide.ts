// 조우 AI 판단(순수) — 기획 D-570(질문 1904 원문 "무조건 전투가 아니라 현재 전투세팅상태나 전력차, 성향에 따라 판정됨, 일정거리내에 유닛이나
// 분대 등이 포함될시 ai 판단계산 회피 또는 약탈"), docs/adr/2026-11-15-unloaded-second-maps.md "바뀜 (D-570, 좌표 이동 3)".
// 편마다 따로 판단한다:
// - 회피(avoid) = 먼저 걸지 않는다. 두 편이 모두 회피하면 아무 일도 없다(쉬는 시간 동안 그 짝을 다시 보지 않는다). 상대가 걸면 수비 편으로 싸운다
//   (달아나기는 아직 없다 — 질문 2022).
// - 전쟁 중인 상대: 전력 비(내 전력 × 1000 ÷ 상대 전력) ≥ 전쟁 문턱이면 전투(fight).
// - 전쟁이 아닌 다른 나라: 상대가 짐을 지녔고 전력 비 ≥ 약탈 문턱이면 약탈(loot). 짐이 없으면 회피(빼앗을 것이 없다). 약탈 전투는 전쟁 전투가
//   아니라 진 유닛은 포로가 아니라 안전한 곳으로 가고, 이긴 편이 진 유닛 짐 몫을 가져간다(D-173 탈취 — 세계 전투 결과 적용 그대로).
// - 성향: NPC는 그 세력의 공격 성향(D-327, 0 ~ 1000). 문턱 × (1000 + (500 − 성향) × 세기 ÷ 1000) ÷ 1000.
// - 플레이어: 행동 설정이 아직 없어 설정 칸 encounter_player_policy가 0(기본)이면 늘 회피, 1이면 성향 500인 NPC처럼 판단한다(질문 2021).
// - "전투 세팅 상태"(질문 2023): 교전 규칙 같은 설정 칸은 아직 없다. 전력이 입은 장비·남은 생명 수치(전투 몸)로 셈하고, 판단하는 유닛이 없는 편
//   (봇·움직이지 못하는 유닛뿐)은 늘 회피한다.
// - 둘 다 걸면 전력 비가 큰 편이 공격 편(같으면 앞 편). 공격 편은 전투맵 시간이 다 되면 진다(D-210 — 수비 = 습격당한 쪽).
import type { EncounterCoefficients } from "@terra/sim";

export type ClashChoice = "avoid" | "loot" | "fight";

/** 판단에 드는 한 편의 값 */
export interface ClashSideView {
  /** 판단하는 유닛 수(0이면 늘 회피) */
  readonly deciders: number;
  /** 플레이어가 움직이는 편인가(아니면 NPC) */
  readonly player: boolean;
  /** NPC 공격 성향(0 ~ 1000). 플레이어는 보지 않는다 */
  readonly aggression: number;
  /** 편 전력(clashPower 합) */
  readonly power: number;
  /** 짐을 지녔나(약탈 거리) */
  readonly carries: boolean;
}

export type EncounterRules = Pick<
  EncounterCoefficients,
  "warRatioPm" | "lootRatioPm" | "aggressionPm" | "playerPolicy"
>;

/** 성향 중간값(플레이어가 NPC 판단을 쓸 때) */
const NEUTRAL_AGGRESSION = 500;

/** 성향을 반영한 문턱(‰) */
export function clashThreshold(base: number, aggression: number, aggressionPm: number): number {
  const shift = Math.floor(((NEUTRAL_AGGRESSION - aggression) * aggressionPm) / 1000);
  return Math.max(0, Math.floor((base * (1000 + shift)) / 1000));
}

/** 전력 비(‰). 상대 전력이 0이면 큰 값 */
export function powerRatioPm(mine: number, theirs: number): number {
  if (theirs <= 0) return mine > 0 ? Number.MAX_SAFE_INTEGER : 0;
  return Math.floor((mine * 1000) / theirs);
}

/** 한 편의 판단 */
export function decideClash(
  me: ClashSideView,
  them: ClashSideView,
  atWar: boolean,
  rules: EncounterRules,
): ClashChoice {
  if (me.deciders <= 0) return "avoid";
  if (me.player && rules.playerPolicy !== 1) return "avoid";
  if (!atWar && !them.carries) return "avoid";
  const aggression = me.player ? NEUTRAL_AGGRESSION : me.aggression;
  const need = clashThreshold(atWar ? rules.warRatioPm : rules.lootRatioPm, aggression, rules.aggressionPm);
  if (powerRatioPm(me.power, them.power) < need) return "avoid";
  return atWar ? "fight" : "loot";
}

export interface ClashResolution {
  /** 공격 편(0 = 앞 편, 1 = 뒤 편) */
  readonly attacker: 0 | 1;
  readonly choice: "loot" | "fight";
  /** 두 편의 판단(기록) */
  readonly choices: readonly [ClashChoice, ClashChoice];
}

/** 두 편 판단을 모아 싸움이 나는지. 둘 다 회피면 null */
export function resolveClash(
  a: ClashSideView,
  b: ClashSideView,
  atWar: boolean,
  rules: EncounterRules,
): ClashResolution | null {
  const first = decideClash(a, b, atWar, rules);
  const second = decideClash(b, a, atWar, rules);
  if (first === "avoid" && second === "avoid") return null;
  let attacker: 0 | 1;
  if (first === "avoid") attacker = 1;
  else if (second === "avoid") attacker = 0;
  else attacker = powerRatioPm(b.power, a.power) > powerRatioPm(a.power, b.power) ? 1 : 0;
  const choice = attacker === 0 ? first : second;
  return { attacker, choice: choice === "avoid" ? "fight" : choice, choices: [first, second] };
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
