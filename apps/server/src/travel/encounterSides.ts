// 조우 한 편의 판단 값 — 질문 2021·2023 답(encounter-4: 판단 입력 = AI 작전 D-5039·D-5040), D-144(오프라인·직무 중 유닛은 먼저 치지 않는다),
// D-573(회피 편 빠르기 비교). 판단 자체는 clashDecide.ts(순수), 이 파일은 편 유닛 → ClashSideView.
// - 판단 유닛마다 작전: 플레이어 유닛 = 저장한 작전(tactics/store.ts, 없으면 균형), NPC 유닛 = 그 세력 공격 성향 → 프리셋(npcPresetOf).
//   [임시] 세계에 파티 묶음이 없어 편 = 한 파티로 보고 판단 유닛 값을 평균한다(내림, 질문 2131) — 걸지 말지(조우 = 기회 하나)만.
//   바뀜(fixes-1116l, D-558 1547 "파티도 없으면 유닛들 개별 참전"): 전투에는 유닛마다 제 파티로 들고 퇴각 기준도 그 유닛 작전(unitRetreats).
// - starters = NPC 판단 유닛 + 주인이 접속 중인 플레이어 판단 유닛(D-144).
//   바뀜(misc-574, D-574 2140 "유닛소유주가 접속하면"): 접속은 유닛마다 그 유닛 소유주의 접속이다. 가문원이 가진 유닛은 그 가문원, 플레이어 가문 소유
//   주체가 가진 유닛(가문 도시 주민)은 그 가문장(가문 주체를 움직이는 사람 — 기술 기본값, 질문 2262)의 접속(encounterWorld.ts online).
// - 바뀜(misc-574, 질문 2224 — D-558 1547): 판단 묶음(groups) = 판단 유닛마다 하나(세계에 파티 묶음이 없다 — 파티가 생기면 파티마다 그 파티 설정).
//   묶음마다 자기 작전·남은 HP·접속·① 굴림으로 판단한다(clashDecide.ts). 평균 칸(engage·retreatPct)은 기록·옛 꼴로만 남는다.
// - 전투 몸이 있으면(띄운 2차맵) 전력·남은 HP %를 몸으로, 아니면 유닛 수(한 명 = 1,000)로 센다.
// - 빠르기 = 편에서 가장 느린 유닛의 걷기 빠르기(실효 AGI·이동 버프, world/walkSpeed.ts — 2차맵이 마지막 이동 때 잰 값·좌표 유닛 행 값).
import { type AiTactics, DEFAULT_PLAYER_PRESET, npcPresetOf, presetTactics } from "@terra/shared/aiTactics";
import {
  type LoyaltyUnitKind,
  type UnitTraits,
  blendTacticsByLoyalty,
  loyaltyOverridePm,
  tacticsFromUnitTraits,
} from "@terra/shared/unitTraits";
import { type NpcAiCoefficients, loyaltyRulesFromAi } from "@terra/sim/npcAi";
import { UNIT_KIND_CYBORG, UNIT_KIND_CYBORG_UNIT } from "../world/unitKinds.ts";
import type { ClashGroupView, ClashSideView } from "./clashDecide.ts";

/** 판단 앞의 한 편 유닛 */
export interface SideUnit {
  readonly unitId: number;
  readonly ownerId: number;
  readonly kind: number;
  readonly decider: boolean;
  /** 걷기 빠르기(단위/초, 모르면 0) */
  readonly speed: number;
}

/** 전투 몸으로 센 값 */
export interface SideBody {
  readonly power: number;
  readonly hp: number;
  readonly maxHp: number;
}

export interface SideSources {
  /** 플레이어(사용자 주체·플레이어 가문) 주체인가 */
  playerOwned(ownerId: number): boolean;
  /** 사용자 주체이고 지금 접속 중인가(아니면 false) */
  online(ownerId: number): boolean;
  /** NPC 주체의 공격 성향(0~1000) */
  aggressionOf(ownerId: number, nation: number): number;
  /** 저장한 작전(없으면 undefined) */
  tacticsOf(unitId: number): AiTactics | undefined;
  /** 개별 유닛 7축 성향(ADR 2026-11-20 4단계). 없으면 기존 공격 성향·플레이어 프리셋 그대로 */
  readonly traitsOf?: ((unitId: number) => UnitTraits | undefined) | undefined;
  /** 플레이어 유닛 만족도 밀리점(0~100,000, 미집계면 null/undefined → 개입률 0‰) */
  readonly loyaltyMilliOf?: ((unitId: number) => number | null | undefined) | undefined;
  /** 충성도 연동 유닛 종류(생략 시 kind 기반 추론: 사이보그 본체=cyborg_main, 사이보그 유닛=android, 그 외=human) */
  readonly loyaltyKindOf?: ((unit: SideUnit) => LoyaltyUnitKind) | undefined;
  /** 분대/국가 지휘관 7축 성향(있으면 commanderSharePm 비율로 합성) */
  readonly commanderTraitsOf?: ((nation: number) => UnitTraits | undefined) | undefined;
  /** 실시간 NPC AI 계수(충성도 곡선·지휘관 비중) */
  readonly aiRules?: (() => NpcAiCoefficients) | undefined;
}

function defaultLoyaltyKind(unit: SideUnit): LoyaltyUnitKind {
  if (unit.kind === UNIT_KIND_CYBORG) return "cyborg_main";
  if (unit.kind === UNIT_KIND_CYBORG_UNIT) return "android";
  return "human";
}

/** 판단 유닛 하나의 실효 작전(플레이어 = 충성도 연동 개성 개입, NPC = 7축 성향 + 지휘관 비중) */
export function unitTactics(unit: SideUnit, nation: number, sources: SideSources): AiTactics {
  const ai = sources.aiRules?.();
  const traits = sources.traitsOf?.(unit.unitId);
  const commanderTraits = sources.commanderTraitsOf?.(nation);
  const commander =
    commanderTraits && (ai?.commanderSharePm ?? 300) > 0
      ? { traits: commanderTraits, sharePm: ai?.commanderSharePm ?? 300 }
      : undefined;

  if (sources.playerOwned(unit.ownerId)) {
    const player = sources.tacticsOf(unit.unitId) ?? presetTactics(DEFAULT_PLAYER_PRESET);
    if (!traits) return player;
    const loyaltyMilli = sources.loyaltyMilliOf?.(unit.unitId);
    const kind = sources.loyaltyKindOf ? sources.loyaltyKindOf(unit) : defaultLoyaltyKind(unit);
    const overridePm = loyaltyOverridePm({
      kind,
      loyaltyMilli,
      traits,
      rules: ai ? loyaltyRulesFromAi(ai) : undefined,
    });
    if (overridePm <= 0) return player;
    return blendTacticsByLoyalty(player, tacticsFromUnitTraits(traits, commander), overridePm);
  }
  if (traits) return tacticsFromUnitTraits(traits, commander);
  return presetTactics(npcPresetOf(sources.aggressionOf(unit.ownerId, nation)));
}

/** 편별 실효 AI 작전 맵(전투 시작 시 CombatUnitSpec.aiTactics 주입용) */
export function sideCombatTactics(
  sides: readonly (readonly SideUnit[])[],
  nations: readonly number[],
  sources: SideSources,
): Map<number, AiTactics> {
  const out = new Map<number, AiTactics>();
  for (const [index, side] of sides.entries())
    for (const unit of side) out.set(unit.unitId, unitTactics(unit, nations[index] ?? 0, sources));
  return out;
}

/** 편 하나의 판단 값. bodies = 유닛 ID → 몸 값(없으면 유닛 수로 센다) */
export function sideView(
  side: readonly SideUnit[],
  nation: number,
  sources: SideSources,
  bodies: ReadonlyMap<number, SideBody> | undefined,
  carriers: ReadonlySet<number>,
  /** 묶음마다 ① 교전 굴림(0 이상 1000 미만). 없으면 0 */
  roll?: () => number,
): ClashSideView {
  const deciders = side.filter((unit) => unit.decider);
  let engage = 0;
  let retreat = 0;
  let players = 0;
  let starters = 0;
  const groups: ClashGroupView[] = [];
  for (const unit of deciders) {
    const tactics = unitTactics(unit, nation, sources);
    engage += tactics.engage;
    retreat += tactics.retreatPct;
    const player = sources.playerOwned(unit.ownerId);
    if (player) players += 1;
    const starter = !player || sources.online(unit.ownerId);
    if (starter) starters += 1;
    const body = bodies?.get(unit.unitId);
    groups.push({
      player,
      starter,
      engage: tactics.engage,
      retreatPct: tactics.retreatPct,
      hpPct: body && body.maxHp > 0 ? Math.floor((body.hp * 100) / body.maxHp) : undefined,
      rollPm: roll?.() ?? 0,
      unitIds: [unit.unitId],
    });
  }
  let power = 0;
  let hp = 0;
  let maxHp = 0;
  let speed = Number.MAX_SAFE_INTEGER;
  for (const unit of side) {
    const body = bodies?.get(unit.unitId);
    power += body?.power ?? 1000;
    hp += body?.hp ?? 0;
    maxHp += body?.maxHp ?? 0;
    speed = Math.min(speed, Math.max(0, unit.speed));
  }
  const count = deciders.length;
  return {
    deciders: count,
    starters,
    player: count > 0 && players === count,
    engage: count > 0 ? Math.floor(engage / count) : 0,
    retreatPct: count > 0 ? Math.floor(retreat / count) : 0,
    hpPct: bodies && maxHp > 0 ? Math.floor((hp * 100) / maxHp) : undefined,
    power,
    carries: side.some((unit) => carriers.has(unit.unitId)),
    speed: side.length > 0 ? speed : 0,
    groups,
  };
}

/** 판단 유닛마다 퇴각 기준(AI 작전 ⑦ — 유닛 개별 파티, D-558 1547). [편 0, 편 1]의 나라 */
export function unitRetreats(
  sides: readonly (readonly SideUnit[])[],
  nations: readonly number[],
  sources: SideSources,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const [index, side] of sides.entries())
    for (const unit of side)
      if (unit.decider) out.set(unit.unitId, unitTactics(unit, nations[index] ?? 0, sources).retreatPct);
  return out;
}
