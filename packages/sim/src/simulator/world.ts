// 시뮬레이터 세계(메모리) — docs/adr/2026-10-31-rules-simulator.md "세계 차리기"
// 세력·도시·유닛과 원장 장부를 들고, 정산은 서버와 같은 공용 함수(settle/owner.ts)로 한다(D-013).
// R1은 고리를 보여 줄 만큼만 있다: 진짜 세력·도시·인구·기술 규칙은 R4, 경제는 R2가 이 모양을 넓힌다.
// 소유 주체 = 세력(시뮬에는 유저가 없다). NPC는 늘 접속 중이다(서버 settlement.ts와 같다).
import { createRng, type Rng } from "@terra/shared";
import { createLedgerAudit, type LedgerAudit } from "../ledger/audit.ts";
import { type LedgerBook, createLedgerBook } from "../ledger/ledgerBook.ts";
import { mix32 } from "../math/hash.ts";
import { type Point } from "../units.ts";
import {
  TEST_ASSET_CREDIT,
  TEST_ASSET_ORE,
  TEST_SYSTEM_ISSUE_CREDIT,
  settleOwnerPeriod,
  testSettleAccounts,
} from "../settle/owner.ts";
import { JOB_GATHER, PHASE_WORK, type JobState } from "../settle/settle.ts";
import type { Scenario } from "./scenario.ts";

export interface SimFaction {
  readonly id: number;
  readonly code: string;
  readonly fixed: boolean;
  tech: number;
  alive: boolean;
  /** 도시 ID(넣은 차례) */
  readonly cities: Set<number>;
  /** 유닛 ID(넣은 차례) */
  readonly units: Set<number>;
  settledAtMs: number;
  upkeepArrears: number;
  /** 판단 횟수(판단 난수의 차례) */
  aiStep: number;
  /** 다음 판단 예약 번호 */
  eventId: number | undefined;
}

export interface SimCity {
  readonly id: number;
  owner: number;
}

export interface SimUnit {
  readonly id: number;
  city: number;
  owner: number;
  job: JobState;
  pos: Point;
  /** 이동 판단 횟수 */
  tripStep: number;
  eventId: number | undefined;
}

export interface SimWorld {
  readonly seed: number;
  readonly factions: Map<number, SimFaction>;
  readonly cities: Map<number, SimCity>;
  readonly units: Map<number, SimUnit>;
  readonly book: LedgerBook;
  readonly audit: LedgerAudit;
  nextFactionId(): number;
}

/** 난수 흐름(세계 시드 하나에서 갈라 쓴다, 기술 순서 ADR 4절 "결정성") */
export const STREAM_SETUP = 1;
export const STREAM_DECIDE = 2;
export const STREAM_TRIP = 3;

/** (세계 시드, 흐름, 대상, 차례)로 정해지는 난수 — 다른 흐름·대상의 판단 수와 상관없이 같은 값 */
export function streamRng(seed: number, stream: number, subject: number, step: number): Rng {
  return createRng(
    mix32(
      seed ^
        Math.imul(stream, 0x27d4_eb2f) ^
        Math.imul(subject, 0x9e37_79b1) ^
        Math.imul(step + 1, 0x85eb_ca6b),
    ),
  );
}

function counter(): () => number {
  let last = 0;
  return () => {
    last += 1;
    return last;
  };
}

const FRESH_JOB: JobState = { job: JOB_GATHER, phase: PHASE_WORK, progressMs: 0, fatigue: 0 };

/** 시나리오에서 세계를 차린다. 처음 화폐는 발행 계정에서 준다(원장에 남는다) */
export function createWorld(scenario: Scenario, seed: number, startMs: number): SimWorld {
  const audit = createLedgerAudit();
  const book = createLedgerBook({ nextAccountId: counter(), nextTxId: counter(), hooks: audit.hooks });
  const nextFactionId = counter();
  const nextCityId = counter();
  const nextUnitId = counter();
  const factions = new Map<number, SimFaction>();
  const cities = new Map<number, SimCity>();
  const units = new Map<number, SimUnit>();
  const setup = streamRng(seed, STREAM_SETUP, 0, 0);
  for (const group of scenario.factions) {
    for (let n = 1; n <= group.count; n++) {
      const id = nextFactionId();
      const code = group.count === 1 ? group.code : `${group.code}_${String(n).padStart(2, "0")}`;
      const faction: SimFaction = {
        id,
        code,
        fixed: group.fixed,
        tech: group.tech,
        alive: true,
        cities: new Set(),
        units: new Set(),
        settledAtMs: startMs,
        upkeepArrears: 0,
        aiStep: 0,
        eventId: undefined,
      };
      factions.set(id, faction);
      const own: number[] = [];
      for (let c = 0; c < group.cities; c++) {
        const city = { id: nextCityId(), owner: id };
        cities.set(city.id, city);
        faction.cities.add(city.id);
        own.push(city.id);
      }
      for (let u = 0; u < group.workers; u++) {
        const unit: SimUnit = {
          id: nextUnitId(),
          city: own[u % own.length] ?? 0,
          owner: id,
          job: FRESH_JOB,
          // 처음 자리는 2차맵 하나 안 아무 곳(합성 이동 부하용)
          pos: { x: setup.nextInt(0x4_0000), y: setup.nextInt(0x4_0000) },
          tripStep: 0,
          eventId: undefined,
        };
        units.set(unit.id, unit);
        faction.units.add(unit.id);
      }
      if (group.credit > 0n)
        book.post({
          kind: "issue",
          atMs: startMs,
          entries: [
            {
              account: book.systemAccount(TEST_SYSTEM_ISSUE_CREDIT, TEST_ASSET_CREDIT),
              amount: -group.credit,
            },
            { account: book.ownerAccount(id, TEST_ASSET_CREDIT), amount: group.credit },
          ],
        });
    }
  }
  return { seed, factions, cities, units, book, audit, nextFactionId };
}

/** 세력 하나를 toMs까지 정산한다(공용 정산 함수, 서버 settlement.ts와 같은 판정) */
export function settleFaction(world: SimWorld, faction: SimFaction, toMs: number): void {
  if (toMs <= faction.settledAtMs) return;
  const list = [...faction.units].map((id) => world.units.get(id)).filter((unit) => unit !== undefined);
  const result = settleOwnerPeriod(
    {
      ownerId: faction.id,
      jobs: list.map((unit) => unit.job),
      fromMs: faction.settledAtMs,
      toMs,
      offlineSinceMs: null,
    },
    world.book,
    testSettleAccounts(world.book, faction.id),
  );
  list.forEach((unit, index) => {
    unit.job = result.jobs[index] ?? unit.job;
  });
  faction.upkeepArrears += result.upkeepUnpaid;
  faction.settledAtMs = toMs;
}

/** 도시 하나와 그 유닛을 다른 세력으로 옮긴다. 두 세력은 먼저 지금까지 정산한다(상호작용 전 정산, S3 ADR 4절) */
export function transferCity(world: SimWorld, cityId: number, to: SimFaction, nowMs: number): void {
  const city = world.cities.get(cityId);
  const from = city ? world.factions.get(city.owner) : undefined;
  if (!city || !from || from === to) return;
  settleFaction(world, from, nowMs);
  settleFaction(world, to, nowMs);
  from.cities.delete(cityId);
  to.cities.add(cityId);
  city.owner = to.id;
  // Set을 돌면서 지금 항목을 지워도 된다(남은 항목은 그대로 돈다)
  for (const unitId of from.units) {
    const unit = world.units.get(unitId);
    if (!unit || unit.city !== cityId) continue;
    from.units.delete(unitId);
    to.units.add(unitId);
    unit.owner = to.id;
  }
}

/** 한 세력의 자산 하나를 다른 세력에게 옮긴다(share = 몫의 분모, 1이면 전부). 옮긴 양 */
export function transferAsset(
  world: SimWorld,
  from: SimFaction,
  to: SimFaction,
  asset: string,
  share: bigint,
  atMs: number,
): bigint {
  const amount = world.book.balanceOf(from.id, asset) / share;
  if (amount <= 0n) return 0n;
  world.book.post({
    kind: "transfer",
    atMs,
    entries: [
      { account: world.book.ownerAccount(from.id, asset), amount: -amount },
      { account: world.book.ownerAccount(to.id, asset), amount },
    ],
  });
  return amount;
}

/** 세계 몫의 불변 조건(원장 감사 + 소속·예약). 위반 문장 목록 */
export function checkWorld(world: SimWorld, nowMs: number, tripsOn: boolean): string[] {
  const problems = world.audit.check(world.book.accounts());
  let badCities = 0;
  let badUnits = 0;
  let missingDecide = 0;
  let missingTrip = 0;
  let future = 0;
  const owned = new Set<number>();
  for (const faction of world.factions.values()) {
    if (!faction.alive) {
      if (faction.cities.size > 0 || faction.units.size > 0) badCities += 1;
      continue;
    }
    if (faction.eventId === undefined) missingDecide += 1;
    if (faction.settledAtMs > nowMs) future += 1;
    for (const cityId of faction.cities) if (world.cities.get(cityId)?.owner !== faction.id) badCities += 1;
    for (const unitId of faction.units) {
      const unit = world.units.get(unitId);
      if (
        !unit ||
        unit.owner !== faction.id ||
        owned.has(unitId) ||
        world.cities.get(unit.city)?.owner !== faction.id
      )
        badUnits += 1;
      owned.add(unitId);
    }
  }
  for (const city of world.cities.values()) if (!world.factions.get(city.owner)?.alive) badCities += 1;
  for (const unit of world.units.values()) {
    if (!owned.has(unit.id)) badUnits += 1;
    if (tripsOn && unit.eventId === undefined) missingTrip += 1;
  }
  const add = (label: string, n: number): void => {
    if (n > 0) problems.push(`${label}: ${n}`);
  };
  add("I4 units not in exactly one living faction with their city", badUnits);
  add("I4 cities whose owner does not list them or is not alive", badCities);
  add("I5 living factions without a scheduled decision", missingDecide);
  add("I5 units without a scheduled trip", missingTrip);
  add("I6 factions settled in the future", future);
  return problems;
}

/** 세계의 시험 자원 합(창고 계정만) */
export function totalOwnerAsset(world: SimWorld, asset: string): bigint {
  let sum = 0n;
  for (const account of world.book.accounts())
    if (account.ownerId !== null && account.asset === asset) sum += account.balance;
  return sum;
}

export { TEST_ASSET_CREDIT, TEST_ASSET_ORE };
