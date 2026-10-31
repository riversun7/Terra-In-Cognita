// [임시] 대리 규칙 — docs/adr/2026-10-31-rules-simulator.md "대리 규칙"
// 게임 규칙이 아니다. 실행 루프·원장·정산·지표 기록기가 함께 도는지 보려고 세력 생김·사라짐·기술 오르내림을 시드 난수로
// 일으킨다. 결과를 D-391 판단에 쓰지 않는다. R4(세력·도시·인구·기술)와 R5(NPC 두뇌)가 이 파일을 대신한다.
// 판단은 예약 시각에만 한다(세력마다 "decide"). 합성 이동 부하(유닛마다 "arrive")는 서버와 같은 이동 함수로 도착 시각을 낸다.
import { WALK_SPEED } from "../units.ts";
import { arrivalAt, createMotion } from "../motion/motion.ts";
import type { EventKey } from "../events/eventKey.ts";
import type { MetricsRecorder } from "./metrics.ts";
import type { ScenarioStub, ScenarioTrips } from "./scenario.ts";
import type { SimLoop } from "./loop.ts";
import {
  STREAM_DECIDE,
  STREAM_TRIP,
  type SimFaction,
  type SimWorld,
  TEST_ASSET_CREDIT,
  TEST_ASSET_ORE,
  settleFaction,
  streamRng,
  transferAsset,
  transferCity,
} from "./world.ts";

export const EVENT_ARRIVE = "arrive";
export const EVENT_DECIDE = "decide";

export type SimEvent = EventKey;

/** 합성 이동의 목적지 범위(2차맵 한 변, 단위) */
const TRIP_SPAN = 0x4_0000;

export interface StubContext {
  readonly world: SimWorld;
  readonly loop: SimLoop<SimEvent>;
  readonly recorder: MetricsRecorder;
  readonly stub: ScenarioStub;
  readonly trips: ScenarioTrips | undefined;
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

function setTech(ctx: StubContext, faction: SimFaction, to: number, cause: string, nowMs: number): void {
  const next = Math.max(1, Math.min(ctx.stub.techMax, to));
  if (next === faction.tech) return;
  ctx.recorder.tech(nowMs, faction.id, faction.tech, next, cause);
  faction.tech = next;
}

/** 첫 도시(넣은 차례)가 아니라 난수로 고른 도시 */
function pickCity(faction: SimFaction, roll: number): number | undefined {
  const list = [...faction.cities];
  return list[roll % list.length];
}

function conquer(
  ctx: StubContext,
  attacker: SimFaction,
  rollTarget: number,
  rollCity: number,
  nowMs: number,
): void {
  const { world } = ctx;
  // 고정 세력은 마지막 도시를 잃지 않는다(D-324)
  const targets = livingIds(world).filter((id) => {
    const faction = world.factions.get(id);
    return id !== attacker.id && faction !== undefined && faction.cities.size > (faction.fixed ? 1 : 0);
  });
  const target = world.factions.get(targets[rollTarget % Math.max(1, targets.length)] ?? 0);
  if (!target || targets.length === 0) return;
  const cityId = pickCity(target, rollCity);
  if (cityId === undefined) return;
  transferCity(world, cityId, attacker, nowMs);
  if (rollCity % 2 === 0) setTech(ctx, target, target.tech - 1, "city_lost", nowMs);
  if (target.cities.size > 0) return;
  // 도시가 없는 유동 세력은 사라진다: 남은 자산은 이긴 세력이 가져간다
  transferAsset(world, target, attacker, TEST_ASSET_CREDIT, 1n, nowMs);
  transferAsset(world, target, attacker, TEST_ASSET_ORE, 1n, nowMs);
  target.alive = false;
  if (target.eventId !== undefined) ctx.loop.cancel(target.eventId);
  target.eventId = undefined;
  ctx.recorder.died(nowMs, target.id, "conquered", { into: attacker.id });
}

function rebel(ctx: StubContext, parent: SimFaction, rollCity: number, nowMs: number): void {
  const { world } = ctx;
  if (parent.cities.size < 2) return;
  const cityId = pickCity(parent, rollCity);
  if (cityId === undefined) return;
  settleFaction(world, parent, nowMs);
  const share = BigInt(parent.cities.size);
  const id = world.nextFactionId();
  const child: SimFaction = {
    id,
    code: `rebel_${id}`,
    fixed: false,
    tech: parent.tech,
    alive: true,
    cities: new Set(),
    units: new Set(),
    settledAtMs: nowMs,
    upkeepArrears: 0,
    aiStep: 0,
    eventId: undefined,
  };
  world.factions.set(id, child);
  // 갈라진 도시 몫만큼 국고를 가져간다
  transferAsset(world, parent, child, TEST_ASSET_CREDIT, share, nowMs);
  transferCity(world, cityId, child, nowMs);
  ctx.recorder.born(nowMs, id, "rebellion", { parent: parent.id, tech: child.tech });
  scheduleDecide(ctx, child, nowMs);
}

/** 세력 판단 하나 */
export function decide(ctx: StubContext, factionId: number, nowMs: number): void {
  const faction = ctx.world.factions.get(factionId);
  if (!faction?.alive) return;
  faction.eventId = undefined;
  const rng = streamRng(ctx.world.seed, STREAM_DECIDE, faction.id, faction.aiStep * 2);
  const action = rng.nextInt(1000);
  const tech = rng.nextInt(1000);
  const rollA = rng.nextInt(0x1_0000);
  const rollB = rng.nextInt(0x1_0000);
  if (action < ctx.stub.conquerPerMille) conquer(ctx, faction, rollA, rollB, nowMs);
  else if (action < ctx.stub.conquerPerMille + ctx.stub.rebelPerMille) rebel(ctx, faction, rollA, nowMs);
  if (tech < ctx.stub.techUpPerMille) setTech(ctx, faction, faction.tech + 1, "research", nowMs);
  else if (tech < ctx.stub.techUpPerMille + ctx.stub.techDownPerMille)
    setTech(ctx, faction, faction.tech - 1, "setback", nowMs);
  // 판단 난수는 차례 2k, 다음 시각 난수는 2k+1(k = 판단 횟수)이라 겹치지 않는다
  faction.aiStep += 1;
  scheduleDecide(ctx, faction, nowMs);
}
