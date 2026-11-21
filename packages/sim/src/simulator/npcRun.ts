// NPC 판단 실행 — docs/adr/2026-11-01-npc-brain-r5.md 3·6절 (옛 stubRules.ts, R1 대리 규칙을 대신함)
// 세력마다 판단 예약("decide")에서: 세계 → 지표(FactionView·RivalView) → npc/brain.ts가 고른 행동 하나 → 세력·사회 규칙(society.ts)·
// 전투(combatRun.ts)로 실행한다. 세율(경제가 있을 때)과 구인(D-469, 행정 건물 구인 카드)은 판단마다 규칙식(npc/policy.ts)으로 따로 돈다.
// 결과(점령·반란·독립·구인 휴먼·기술·백지 강화)는 규칙이 정한다. 서버(apps/server/src/npc/)도 같은 함수를 실제 시각으로 부른다.
// 폐허 복원(기획 답 484 다): 정부 짓기 후보는 폐허 규칙(societyRuins.ts npcOptions)이 고르고, 판단이 고르면 같은 규칙이 실행한다(npcAct).
// 넣기·투자는 하루 끝 규칙식(societyRuins.ts endOfDay)이다.
// 빈 2차맵 알박기(빈틈 2243): 후보·실행은 알박기 실행 자리(NpcClaimRun — 시뮬 simulator/npcClaim.ts, 서버는 아직 없음 = 후보 없음)가 한다.
// 합성 이동 부하(유닛마다 "arrive")는 서버와 같은 이동 함수로 도착 시각을 낸다.
import { WALK_SPEED } from "../units.ts";
import { arrivalAt, createMotion } from "../motion/motion.ts";
import type { EventKey } from "../events/eventKey.ts";
import {
  type ClaimView,
  type FactionView,
  type NpcAction,
  type RivalView,
  decideAction,
  peaceScore,
} from "../npc/brain.ts";
import { nextTaxBp, occupationChoice, recruitPicks } from "../npc/policy.ts";
import type { SocietyCoefficients } from "../society/coefficients.ts";
import { cityHousingCap } from "../society/logistics.ts";
import { shareAsset } from "../society/shares.ts";
import { rebuildCost } from "../society/warOutcomes.ts";
import { inTruce, recordFight } from "../society/wars.ts";
import type { CombatRun } from "./combatRun.ts";
import { type NpcBuildRun, buildPolicy } from "./npcBuild.ts";
import type { MetricsRecorder } from "./metrics.ts";
import type { ScenarioSociety, ScenarioTrips } from "./scenario.ts";
import type { SimLoop } from "./loop.ts";
import type { SocietyRun } from "./society.ts";
import {
  HOMELESS,
  STREAM_DECIDE,
  STREAM_TRIP,
  type SimFaction,
  type SimWorld,
  TEST_ASSET_CREDIT,
  streamRng,
} from "./world.ts";

export const EVENT_ARRIVE = "arrive";
export const EVENT_DECIDE = "decide";

export type SimEvent = EventKey;

/** 합성 이동의 목적지 범위(2차맵 한 변, 단위) */
const TRIP_SPAN = 0x4_0000;

/** 경제를 돌리면 자산 옮기기·생필품·세율을 경제가 맡는다(simulator/run.ts가 붙인다) */
export interface SimHooks {
  /** 국고 자산(세력 화폐) */
  treasuryAsset(faction: SimFaction): string;
  /** 도시 주인이 바뀌기 바로 전(옛 주인을 아직 안다) */
  beforeCityTransfer(cityId: number, from: SimFaction, to: SimFaction, nowMs: number): void;
  /** 반란으로 새 세력이 생긴 바로 뒤(국고 몫을 옮기기 전) */
  factionBorn(child: SimFaction, parent: SimFaction): void;
  /** 사라지는 세력의 남은 자산을 이긴 쪽으로 */
  factionDied(target: SimFaction, attacker: SimFaction, nowMs: number): void;
  /** 도시의 유닛 수가 바뀌었다(출생·사망·이주) */
  unitsChanged?(cityId: number, delta: number): void;
  /** 도시가 폐허가 되기 바로 전(거래소 주문 돌려주기·시설 멈춤·창고 물건 소각, D-464 217) */
  cityRuined?(cityId: number, nowMs: number): void;
  /** 새 마을이 생겼다(유닛 수) */
  cityFounded?(cityId: number, units: number, nowMs: number): void;
  /** 그 도시의 오늘 생필품 충족도(‰). 경제가 없으면 undefined */
  foodPmOf?(cityId: number): number | undefined;
  /** 그 도시 거래소들이 걷은 거래세 누적(그때 주인 국고 화폐 최소 단위). 없으면 세금 없음(배당 없음) */
  taxCollectedOf?(cityId: number): bigint;
  /** 그 세력이 낸 발행 이자 누적(D-303, 화폐를 찍지 않으면 0) */
  interestPaidOf?(factionId: number): bigint;
  /**
   * 독재 세력의 남은 이익 국고 몫을 받을 지배 가문 금고 계정 ID(D-338, 서버만 — 가문마다 따로 둔 금고). 없거나 undefined면 rulingFamilyOf(국고 주체)
   * 그대로(시뮬은 가문 층이 없다)
   */
  rulingVaultOf?(faction: SimFaction, asset: string): number | undefined;
  /**
   * 그 독재 세력의 남은 이익을 지배 가문 금고(rulingVaultOf)에 넣은 배당 차례가 끝났다(서버만 — NPC 지배 가문이 금고 돈을 쓰는 규칙, 기획 대조
   * 2223 고침). 시뮬은 가문 층이 없어 부르지 않는다
   */
  rulingVaultPaid?(faction: SimFaction, asset: string, nowMs: number): void;
  /** 휴먼 지갑에 들 수 있는 화폐(simulator/humanPurse.ts — 죽은 휴먼 지갑 상속). 없으면 지갑을 보지 않는다(경제 없음) */
  moneyAssets?(): readonly string[];
  /** 도시 주인 바뀜 밖에서 휴먼의 주인이 바뀌었다(새 마을 등) — 지갑을 새 주인 밑으로 옮긴다 */
  unitsOwnerChanged?(unitIds: readonly number[], from: number, to: number, nowMs: number): void;
  /** 세율(거래세 만분율): 지금 값·프리셋 기본값·바꾸기. 없으면 세율 규칙식이 돌지 않는다 */
  taxOf?(faction: SimFaction): number;
  baseTaxOf?(faction: SimFaction): number;
  setTax?(faction: SimFaction, taxBp: number, nowMs: number): void;
}

/** 판단 실행 횟수(요약 npc 칸) */
export interface NpcCounts {
  readonly actions: Record<NpcAction["kind"], number>;
  peaceRefused: number;
  taxChanges: number;
  /** 구인 규칙식으로 산 카드 수(D-469) */
  recruits: number;
  /** 그 가운데 경비대로 다시 채운 수(기획 답 920 나) */
  guardRefills: number;
  /** NPC 증축(질문 1101 나, npcBuild.ts): 짓기 시작한 수·다 지어 생산에 넣은 수 */
  builds: number;
  buildsDone: number;
  /** 레벨 올리기 시작한 수(1146 나)·수리 시작한 수(1114 가) */
  upgrades: number;
  repairs: number;
  /** 면적 모듈 붙이기 시작한 수(기획 D-569 1768) */
  plots: number;
}

export function emptyNpcCounts(): NpcCounts {
  return {
    actions: {
      idle: 0,
      attack: 0,
      found: 0,
      research: 0,
      sell_shares: 0,
      peace: 0,
      break_vassal: 0,
      restore: 0,
      claim: 0,
    },
    peaceRefused: 0,
    taxChanges: 0,
    recruits: 0,
    guardRefills: 0,
    builds: 0,
    buildsDone: 0,
    upgrades: 0,
    repairs: 0,
    plots: 0,
  };
}

/**
 * 빈 2차맵 알박기 실행 자리(빈틈 2243 — 기획 D-212·D-572·D-574): 후보(자리 모형·상한 — 세력마다 가장 좋은 하나)와 실행(정부 짓기 시작). 다 지으면
 * 새 도시는 실행 자리가 세운다(시뮬 = 짓는 중 정부 끝 예약, 서버 = 행정 건물 → ruins/landClaim.ts foundPending)
 */
export interface NpcClaimRun {
  options(faction: SimFaction, nowMs: number): ClaimView[];
  /** 정부 짓기를 시작한다. 시작했나 */
  act(faction: SimFaction, site: number, nowMs: number): boolean;
  /**
   * 판단 끝(증축 다음)에 한 번: 상한·자리는 넘었는데 재료를 낼 도시 창고에 재료가 모자라면 그 도시 목표 재고에 넣어 거래 판단이 사게 한다
   * (npc-claim-3, 질문 2331 가 — 증축과 같은 길). 없으면 사지 않는다
   */
  prepare?(faction: SimFaction, nowMs: number): void;
}

export interface NpcContext {
  readonly world: SimWorld;
  readonly loop: SimLoop<SimEvent>;
  readonly recorder: MetricsRecorder;
  /** 세력·사회 계수표(npc 칸 포함) */
  readonly c: SocietyCoefficients;
  /** 판단 간격(시나리오가 바꿀 수 있다. 없으면 c.npc.decideEveryMs) */
  readonly decideEveryMs: number;
  /** 마을 세우는 값·연구 시설 값(시나리오 society 칸, 서버는 서버 설정) */
  readonly settings: ScenarioSociety;
  readonly trips: ScenarioTrips | undefined;
  readonly hooks?: SimHooks | undefined;
  /** 있으면 도시 빼앗기를 공성 전투로 정하고 조우 전투를 연다 */
  readonly combat?: CombatRun | undefined;
  readonly encounterPerMille?: number | undefined;
  /** 진짜 규칙(점령 처리·마을·지분·연구·전쟁). run.ts가 붙인다 */
  society?: SocietyRun | undefined;
  readonly counts: NpcCounts;
  /**
   * 세력이 남의 도시를 치려 한다(도시를 고른 뒤, 공성 전). 정원사가 필수 NPC 세력을 친 세력에게 보호 레이드를 보낸다
   * (D-500, docs/adr/2026-11-01-gardener-r5b.md "바뀜 (2026-11-07, 정원사 2)"). run.ts·서버 런타임이 붙인다
   */
  onAttack?: ((attacker: SimFaction, target: SimFaction, cityId: number, nowMs: number) => void) | undefined;
  /** NPC 증축(질문 1101 나, npcBuild.ts — 경제가 있을 때 run.ts·서버 런타임이 붙인다). 없으면 짓지 않는다 */
  build?: NpcBuildRun | undefined;
  /** 빈 2차맵 알박기(빈틈 2243 — run.ts가 붙인다). 없으면 후보가 없다(서버는 아직 붙이지 않는다) */
  claims?: NpcClaimRun | undefined;
}

/** 다음 판단 시각: 간격 ±25% */
export function scheduleDecide(ctx: NpcContext, faction: SimFaction, fromMs: number): void {
  const rng = streamRng(ctx.world.seed, STREAM_DECIDE, faction.id, faction.aiStep * 2 + 1);
  const quarter = Math.floor(ctx.decideEveryMs / 4);
  const delay = ctx.decideEveryMs - quarter + rng.nextInt(quarter * 2 + 1);
  faction.eventId = ctx.loop.schedule(fromMs + delay, { kind: EVENT_DECIDE, subject: faction.id });
}

/** 유닛 하나의 다음 이동: 아무 곳으로 걸어가 도착하고, 쉬었다가 다시 고른다 */
export function scheduleTrip(ctx: NpcContext, unitId: number, fromMs: number): void {
  const unit = ctx.world.units.get(unitId);
  const trips = ctx.trips;
  if (!unit || !trips) return;
  const rng = streamRng(ctx.world.seed, STREAM_TRIP, unit.id, unit.tripStep);
  unit.tripStep += 1;
  const to = { x: rng.nextInt(TRIP_SPAN), y: rng.nextInt(TRIP_SPAN) };
  const idle = trips.idleMinMs + rng.nextInt(trips.idleMaxMs - trips.idleMinMs + 1);
  const motion = createMotion({ waypoints: [unit.pos, to], departAtMs: fromMs + idle, speed: WALK_SPEED });
  unit.pos = to;
  unit.eventId = ctx.loop.schedule(arrivalAt(motion), { kind: EVENT_ARRIVE, subject: unit.id });
}

const treasuryAssetOf = (ctx: NpcContext, faction: SimFaction): string =>
  ctx.hooks?.treasuryAsset(faction) ?? TEST_ASSET_CREDIT;

/** 도시마다 그 세력 휴먼 수·만족도 합(세력의 유닛만 돈다) */
function citizens(ctx: NpcContext, faction: SimFaction): Map<number, { n: number; sum: number }> {
  const out = new Map<number, { n: number; sum: number }>();
  for (const unitId of faction.units) {
    const unit = ctx.world.units.get(unitId);
    if (!unit) continue;
    const entry = out.get(unit.city) ?? { n: 0, sum: 0 };
    entry.n += 1;
    entry.sum += unit.satisfactionMilli;
    out.set(unit.city, entry);
  }
  return out;
}

/** 한 번 파는 지분 수(society.sellShares와 같다) */
const SHARE_LOT = 100n;

/** 100주를 팔아도 쥐고 있을 몫(‰)이 남는 도시인가(shareKeepPm − 상업 ÷ 10) */
function sellableCity(ctx: NpcContext, faction: SimFaction, cityId: number): boolean {
  const have = ctx.world.book.balanceOf(faction.id, shareAsset(cityId));
  const keep = BigInt(ctx.c.npc.shareKeepPm - Math.floor(faction.traits.commerce / 10));
  return have > SHARE_LOT && (have - SHARE_LOT) * 1000n >= keep * BigInt(ctx.c.sharesPerCity);
}

/** 세력 하나의 지표(npc/brain.ts FactionView). nowMs = 폐허 복원 후보를 고르는 시각 */
export function factionView(ctx: NpcContext, faction: SimFaction, nowMs: number): FactionView {
  const { world, c, settings } = ctx;
  const byCity = citizens(ctx, faction);
  let sum = 0;
  let food = 1000;
  let crowded = false;
  let sellable = false;
  let bestCity: { level: number; development: number; id: number } | undefined;
  let maxResearch = 0;
  for (const cityId of [...faction.cities].toSorted((a, b) => a - b)) {
    const city = world.cities.get(cityId);
    if (!city) continue;
    const here = byCity.get(cityId);
    sum += here?.sum ?? 0;
    food = Math.min(food, ctx.hooks?.foodPmOf?.(cityId) ?? 1000);
    // 붐빔 = 주거가 꽉 찼고 마을로 떠날 사람이 모자라지 않다(society.found와 같은 조건)
    if ((here?.n ?? 0) >= cityHousingCap(city) && (here?.n ?? 0) >= settings.founders) crowded = true;
    if (sellableCity(ctx, faction, cityId)) sellable = true;
    maxResearch = Math.max(maxResearch, city.researchLevel);
    // 연구 시설을 올릴 도시 = society.buildResearch와 같은 차례(발전도 높은 것, 같으면 작은 ID)
    if (city.researchLevel < c.techGroundMax && (!bestCity || city.development > bestCity.development))
      bestCity = { level: city.researchLevel, development: city.development, id: city.id };
  }
  // 노숙 휴먼(떠도는 세력, D-464 217)도 만족도 평균에 든다
  sum += byCity.get(HOMELESS)?.sum ?? 0;
  const strength = faction.units.size;
  const treasury = world.book.balanceOf(faction.id, treasuryAssetOf(ctx, faction));
  // 다음 기술 단계가 연구 시설에 막혔다: 지금 단계 < 상한, 어느 도시도 다음 단계 연구 시설이 없고, 발전도는 다음 단계에 넉넉하다
  const blocked =
    bestCity !== undefined &&
    faction.tech < c.techGroundMax &&
    maxResearch <= faction.tech &&
    bestCity.development >= c.developmentPerTech * faction.tech;
  const overlord = faction.overlord === null ? undefined : world.factions.get(faction.overlord);
  let vassals = 0;
  for (const other of world.factions.values()) if (other.alive && other.overlord === faction.id) vassals += 1;
  return {
    id: faction.id,
    traits: faction.traits,
    cities: faction.cities.size,
    strength,
    treasury,
    satisfaction: strength === 0 ? 0 : Math.floor(sum / strength / 1000),
    foodPm: food,
    crowded,
    foundCost: settings.foundCost,
    research: bestCity ? { cost: settings.researchBuildCost * BigInt(bestCity.level + 1), blocked } : null,
    sellableShares: sellable,
    poor: treasury < settings.foundCost,
    overlord: overlord?.alive ? { id: overlord.id, strength: overlord.units.size } : null,
    vassals,
    restores: ctx.society?.ruins.npcOptions(faction, nowMs) ?? [],
    claims: ctx.claims?.options(faction, nowMs) ?? [],
  };
}

/**
 * 봉신 묶음(D-216·D-250 "같은 세력 = 국가 전체, 봉신 관계만 따라 올라감"): 세력 → 맨 위 상위 세력, 묶음 → 휴먼 수 합.
 * 묶음 안 세력끼리는 치지 않고, 묶음 안 세력을 치면 묶음 전체가 지킨다(상대 힘 = 묶음 힘, 기술 해석)
 */
export interface Blocs {
  readonly topOf: Map<number, number>;
  readonly strengthOf: Map<number, number>;
}

export function blocsOf(world: SimWorld): Blocs {
  const topOf = new Map<number, number>();
  const strengthOf = new Map<number, number>();
  for (const faction of world.factions.values()) {
    if (!faction.alive) continue;
    let top = faction;
    // 상위 관계가 돌아 들어와도 멈추게(세력 수만큼만 올라간다)
    for (let hop = 0; top.overlord !== null && hop < world.factions.size; hop++) {
      const up = world.factions.get(top.overlord);
      if (!up?.alive) break;
      top = up;
    }
    topOf.set(faction.id, top.id);
    strengthOf.set(top.id, (strengthOf.get(top.id) ?? 0) + faction.units.size);
  }
  return { topOf, strengthOf };
}

/**
 * attacker가 지금 칠 수 있는 남의 도시인가: 시작 도시가 아니고(D-341 — 주인이 바뀌지 않는다), 내가 점령 상태로 두거나 약탈 중인(정부가 무너져
 * 옛 세력이 재건하기 전) 도시가 아니다(D-520·D-527 — 옛 세력이 정부를 재건하면 다시 전쟁이라 다시 칠 수 있다)
 */
function targetable(world: SimWorld, attacker: SimFaction, cityId: number): boolean {
  if (world.cities.get(cityId)?.start !== false) return false;
  const held = world.occupations.get(cityId);
  return !(held && held.kind !== "annexed" && held.occupier === attacker.id);
}

/** 다른 세력 하나를 faction이 본 모습 */
export function rivalView(
  ctx: NpcContext,
  faction: SimFaction,
  other: SimFaction,
  nowMs: number,
  blocs: Blocs = blocsOf(ctx.world),
): RivalView {
  let takeable = 0;
  for (const cityId of other.cities) if (targetable(ctx.world, faction, cityId)) takeable += 1;
  const top = blocs.topOf.get(other.id) ?? other.id;
  return {
    id: other.id,
    strength: blocs.strengthOf.get(top) ?? other.units.size,
    takeable,
    atWar: faction.wars.has(other.id),
    truce: inTruce(faction, other.id, nowMs),
    related: top === (blocs.topOf.get(faction.id) ?? faction.id),
    rebel: other.rebelOf === faction.id,
  };
}

function rivalsOf(ctx: NpcContext, faction: SimFaction, nowMs: number): RivalView[] {
  const blocs = blocsOf(ctx.world);
  const out: RivalView[] = [];
  for (const other of ctx.world.factions.values())
    if (other.alive && other.id !== faction.id) out.push(rivalView(ctx, faction, other, nowMs, blocs));
  return out;
}

/**
 * 치기: (선포했으면) 남의 도시 하나를 고르고, 전투가 켜져 있으면 공성에서 이겨야 한다. 이긴 뒤 결과(약탈·점령 상태·점령·귀속, D-520)는 성향 가중
 * 규칙식이 outcomeRoll로 고른다
 */
function attack(
  ctx: NpcContext,
  attacker: SimFaction,
  targetId: number,
  roll: number,
  outcomeRoll: number,
  nowMs: number,
): void {
  const { world } = ctx;
  const target = world.factions.get(targetId);
  if (!target?.alive) return;
  // 칠 수 있는 도시(targetable) 가운데 난수로 고른 도시(넣은 차례가 아니라)
  const takeable = [...target.cities].filter((cityId) => targetable(world, attacker, cityId));
  const cityId = takeable[roll % Math.max(1, takeable.length)];
  if (cityId === undefined) return;
  ctx.onAttack?.(attacker, target, cityId, nowMs);
  if (ctx.combat) {
    const won = ctx.combat.siege(attacker, target, cityId, nowMs);
    recordFight(attacker, attacker.id, target, target.id, nowMs);
    if (!won) return;
  }
  // 점령·귀속은 재건 비용을 낼 국고가 있어야 고른다
  const housing = world.cities.get(cityId)?.housing ?? 0;
  const funds = world.book.balanceOf(attacker.id, treasuryAssetOf(ctx, attacker));
  const canAnnex = funds >= rebuildCost(housing, ctx.c.war);
  ctx.society?.occupy(
    attacker,
    target,
    cityId,
    occupationChoice(attacker.traits, outcomeRoll, canAnnex, ctx.c.npc, ctx.c.war),
    nowMs,
  );
}

/** 강화 제안: 받는 쪽의 강화 점수가 0 넘으면 맺는다(질문 195 가) */
function proposePeace(ctx: NpcContext, from: SimFaction, toId: number, nowMs: number): void {
  const to = ctx.world.factions.get(toId);
  if (!to?.alive || !from.wars.has(toId)) return;
  if (peaceScore(factionView(ctx, to, nowMs), rivalView(ctx, to, from, nowMs), ctx.c.npc) > 0)
    ctx.society?.makePeace(from, to, nowMs);
  else ctx.counts.peaceRefused += 1;
}

/** 세율 규칙식(경제가 있을 때만, 질문 197 가) */
function taxPolicy(ctx: NpcContext, faction: SimFaction, view: FactionView, nowMs: number): void {
  const hooks = ctx.hooks;
  if (!hooks?.setTax || !hooks.taxOf || !hooks.baseTaxOf) return;
  const current = hooks.taxOf(faction);
  const next = nextTaxBp(
    {
      current,
      base: hooks.baseTaxOf(faction),
      treasury: view.treasury,
      before: faction.taxBefore,
      satisfaction: view.satisfaction,
    },
    ctx.c.npc,
  );
  faction.taxBefore = view.treasury;
  if (next === current) return;
  hooks.setTax(faction, next, nowMs);
  ctx.counts.taxChanges += 1;
}

/**
 * 구인 규칙식(D-469 "NPC도 이런 경로를 통해 인구를 늘리며 생산발전", npc/policy.ts recruitPicks): 그 세력 도시마다(ID 차례) 휴먼이
 * 목표보다 적으면 그 창의 남은 카드를 산다. 경비대가 등급 값(SimFaction.guardsPerCity)보다 적으면 먼저 경비대로 다시 채운다(기획 답 920 나).
 * 행동 하나와 따로 판단마다 돈다(세율과 같은 자리). 서버 NPC 런타임도 이 함수를 그대로 부른다(가문 도시 자동 구인도 이 함수만 — 질문 1041 다,
 * apps/server/src/npc/houseRecruit.ts)
 */
export function recruitPolicy(ctx: NpcContext, faction: SimFaction, nowMs: number): void {
  const society = ctx.society;
  if (!society) return;
  const byCity = citizens(ctx, faction);
  const guardTarget = faction.guardsPerCity ?? 0;
  const guardsByCity = new Map<number, number>();
  if (guardTarget > 0)
    for (const unitId of faction.units) {
      const unit = ctx.world.units.get(unitId);
      if (unit?.guard === true) guardsByCity.set(unit.city, (guardsByCity.get(unit.city) ?? 0) + 1);
    }
  const asset = treasuryAssetOf(ctx, faction);
  for (const cityId of [...faction.cities].toSorted((a, b) => a - b)) {
    const city = ctx.world.cities.get(cityId);
    const view = society.recruitView(faction, cityId, nowMs);
    if (!city || !view) continue;
    const picks = recruitPicks(
      {
        cards: view.cards,
        taken: view.taken,
        population: byCity.get(cityId)?.n ?? 0,
        housing: cityHousingCap(city),
        treasury: ctx.world.book.balanceOf(faction.id, asset),
        guards: guardsByCity.get(cityId) ?? 0,
        guardTarget,
        // 배후지에서 받은 몫이 문턱 아래면 인구를 늘리지 않는다(catchmentRun.ts — 지난 하루 끝 값, 없으면 다 받음)
        growthBlocked: (city.supplyPm ?? 1000) < ctx.c.worldSeed.catchmentGrowthMinPm,
      },
      ctx.c.npc,
    );
    for (const pick of picks)
      if (society.recruit(faction, cityId, pick.slot, nowMs, pick.guard)) {
        ctx.counts.recruits += 1;
        if (pick.guard) ctx.counts.guardRefills += 1;
      }
  }
}

/** 세력 판단 하나 */
export function decide(ctx: NpcContext, factionId: number, nowMs: number): void {
  const faction = ctx.world.factions.get(factionId);
  if (!faction?.alive) return;
  faction.eventId = undefined;
  const rng = streamRng(ctx.world.seed, STREAM_DECIDE, faction.id, faction.aiStep * 2);
  // 굴림 수는 판단마다 같다(무엇을 하든 다음 굴림이 밀리지 않게): 같은 점수 고르기, 도시 고르기, 지분 고르기·공성 결과 고르기
  const rolls = [rng.nextInt(0x1_0000), rng.nextInt(0x1_0000), rng.nextInt(0x1_0000)];
  const view = factionView(ctx, faction, nowMs);
  const action = decideAction(view, rivalsOf(ctx, faction, nowMs), rolls[0] ?? 0, ctx.c.npc);
  ctx.counts.actions[action.kind] += 1;
  const society = ctx.society;
  switch (action.kind) {
    case "attack": {
      const target = ctx.world.factions.get(action.target);
      if (action.declare && target) society?.declareWar(faction, target, nowMs);
      attack(ctx, faction, action.target, rolls[1] ?? 0, rolls[2] ?? 0, nowMs);
      break;
    }
    case "found":
      society?.found(faction, nowMs);
      break;
    case "research":
      society?.buildResearch(faction, nowMs);
      break;
    case "sell_shares": {
      const cities = [...faction.cities]
        .toSorted((a, b) => a - b)
        .filter((id) => sellableCity(ctx, faction, id));
      const cityId = cities[(rolls[2] ?? 0) % Math.max(1, cities.length)];
      if (cityId !== undefined) society?.sellShares(faction, cityId, nowMs);
      break;
    }
    case "peace":
      proposePeace(ctx, faction, action.target, nowMs);
      break;
    case "break_vassal":
      society?.breakVassal(faction);
      break;
    case "restore":
      society?.ruins.npcAct(faction, action.ruin, nowMs);
      break;
    case "claim":
      ctx.claims?.act(faction, action.site, nowMs);
      break;
    case "idle":
      break;
  }
  // 세율은 판단을 시작할 때 본 국고끼리 견준다(행동이 쓴 돈과 섞이지 않게)
  if (faction.alive) taxPolicy(ctx, faction, view, nowMs);
  if (faction.alive) recruitPolicy(ctx, faction, nowMs);
  if (faction.alive && ctx.build) buildPolicy(ctx, ctx.build, faction, nowMs);
  if (faction.alive) ctx.claims?.prepare?.(faction, nowMs);
  if (ctx.combat && rng.nextInt(1000) < (ctx.encounterPerMille ?? 0) && faction.alive)
    ctx.combat.encounter(faction, rng.nextInt(0x1_0000), nowMs);
  // 판단 난수는 차례 2k, 다음 시각 난수는 2k+1(k = 판단 횟수)이라 겹치지 않는다
  faction.aiStep += 1;
  if (faction.alive) scheduleDecide(ctx, faction, nowMs);
}
