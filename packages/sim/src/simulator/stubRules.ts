// [임시] NPC 판단 대리 — docs/adr/2026-10-31-rules-simulator.md "대리 규칙", docs/adr/2026-10-31-faction-society-core.md "시뮬레이터"
// 무엇을 해 볼지(남의 도시 치기·마을 세우기·지분 팔기·연구 시설·봉신 독립)만 시드 난수로 정한다. 결과는 진짜 규칙(R4b
// society.ts: 점령·반란·독립·출생·수명·기술)이 정한다. R5(NPC 두뇌)가 이 판단을 대신한다.
// 판단은 예약 시각에만 한다(세력마다 "decide"). 합성 이동 부하(유닛마다 "arrive")는 서버와 같은 이동 함수로 도착 시각을 낸다.
import { WALK_SPEED } from "../units.ts";
import { arrivalAt, createMotion } from "../motion/motion.ts";
import type { EventKey } from "../events/eventKey.ts";
import type { CombatRun } from "./combatRun.ts";
import type { MetricsRecorder } from "./metrics.ts";
import type { ScenarioStub, ScenarioTrips } from "./scenario.ts";
import type { SimLoop } from "./loop.ts";
import type { SocietyRun } from "./society.ts";
import { STREAM_DECIDE, STREAM_TRIP, type SimFaction, type SimWorld, streamRng } from "./world.ts";

export const EVENT_ARRIVE = "arrive";
export const EVENT_DECIDE = "decide";

export type SimEvent = EventKey;

/** 합성 이동의 목적지 범위(2차맵 한 변, 단위) */
const TRIP_SPAN = 0x4_0000;

/** 경제를 돌리면 대리 규칙의 자산 옮기기를 경제가 맡는다(simulator/run.ts가 붙인다) */
export interface StubHooks {
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
  /** 새 마을이 생겼다(유닛 수) */
  cityFounded?(cityId: number, units: number, nowMs: number): void;
  /** 그 도시의 오늘 생필품 충족도(‰). 경제가 없으면 undefined */
  foodPmOf?(cityId: number): number | undefined;
}

export interface StubContext {
  readonly world: SimWorld;
  readonly loop: SimLoop<SimEvent>;
  readonly recorder: MetricsRecorder;
  readonly stub: ScenarioStub;
  readonly trips: ScenarioTrips | undefined;
  readonly hooks?: StubHooks | undefined;
  /** 있으면 도시 빼앗기를 공성 전투로 정하고 조우 전투를 연다 */
  readonly combat?: CombatRun | undefined;
  readonly encounterPerMille?: number | undefined;
  /** 진짜 규칙(점령 처리·마을·지분·연구). run.ts가 붙인다 */
  society?: SocietyRun | undefined;
}

/** 다음 판단 시각: 간격 ±25% */
export function scheduleDecide(ctx: StubContext, faction: SimFaction, fromMs: number): void {
  const rng = streamRng(ctx.world.seed, STREAM_DECIDE, faction.id, faction.aiStep * 2 + 1);
  const quarter = Math.floor(ctx.stub.decideEveryMs / 4);
  const delay = ctx.stub.decideEveryMs - quarter + rng.nextInt(quarter * 2 + 1);
  faction.eventId = ctx.loop.schedule(fromMs + delay, { kind: EVENT_DECIDE, subject: faction.id });
}

/** 유닛 하나의 다음 이동: 아무 곳으로 걸어가 도착하고, 쉬었다가 다시 고른다 */
export function scheduleTrip(ctx: StubContext, unitId: number, fromMs: number): void {
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

function livingIds(world: SimWorld): number[] {
  const ids: number[] = [];
  for (const faction of world.factions.values()) if (faction.alive) ids.push(faction.id);
  return ids;
}

/** 첫 도시(넣은 차례)가 아니라 난수로 고른 도시 */
function pickCity(cities: readonly number[], roll: number): number | undefined {
  return cities[roll % Math.max(1, cities.length)];
}

function conquer(ctx: StubContext, attacker: SimFaction, rolls: readonly number[], nowMs: number): void {
  const { world } = ctx;
  // 시작 도시는 주인이 바뀌지 않는다(D-341) → 칠 수 있는 도시가 있는 세력만
  const takeable = (id: number) =>
    [...(world.factions.get(id)?.cities ?? [])].filter((cityId) => world.cities.get(cityId)?.start === false);
  const targets = livingIds(world).filter((id) => id !== attacker.id && takeable(id).length > 0);
  const target = world.factions.get(targets[(rolls[0] ?? 0) % Math.max(1, targets.length)] ?? 0);
  if (!target || targets.length === 0) return;
  const cityId = pickCity(takeable(target.id), rolls[1] ?? 0);
  if (cityId === undefined) return;
  // 전투가 켜져 있으면 공성 전투에서 이겨야 도시가 넘어간다
  if (ctx.combat && !ctx.combat.siege(attacker, target, cityId, nowMs)) return;
  ctx.society?.occupy(attacker, target, cityId, [rolls[2] ?? 0, rolls[3] ?? 0], nowMs);
}

/** 세력 판단 하나 */
export function decide(ctx: StubContext, factionId: number, nowMs: number): void {
  const faction = ctx.world.factions.get(factionId);
  if (!faction?.alive) return;
  faction.eventId = undefined;
  const rng = streamRng(ctx.world.seed, STREAM_DECIDE, faction.id, faction.aiStep * 2);
  // 굴림 수는 판단마다 같다(무엇을 하든 다음 굴림이 밀리지 않게)
  const tries = [
    rng.nextInt(1000),
    rng.nextInt(1000),
    rng.nextInt(1000),
    rng.nextInt(1000),
    rng.nextInt(1000),
  ];
  const rolls = [rng.nextInt(0x1_0000), rng.nextInt(0x1_0000), rng.nextInt(0x1_0000), rng.nextInt(0x1_0000)];
  const stub = ctx.stub;
  if ((tries[0] ?? 1000) < stub.conquerPerMille) conquer(ctx, faction, rolls, nowMs);
  if ((tries[1] ?? 1000) < stub.foundPerMille && faction.alive)
    ctx.society?.found(faction, rolls[0] ?? 0, nowMs);
  if ((tries[2] ?? 1000) < stub.shareSalePerMille && faction.alive)
    ctx.society?.sellShares(faction, rolls[1] ?? 0, nowMs);
  if ((tries[3] ?? 1000) < stub.researchBuildPerMille && faction.alive)
    ctx.society?.buildResearch(faction, nowMs);
  if ((tries[4] ?? 1000) < stub.vassalBreakPerMille && faction.alive) ctx.society?.breakVassal(faction);
  if (ctx.combat && rng.nextInt(1000) < (ctx.encounterPerMille ?? 0) && faction.alive)
    ctx.combat.encounter(faction, rng.nextInt(0x1_0000), nowMs);
  // 판단 난수는 차례 2k, 다음 시각 난수는 2k+1(k = 판단 횟수)이라 겹치지 않는다
  faction.aiStep += 1;
  if (faction.alive) scheduleDecide(ctx, faction, nowMs);
}
