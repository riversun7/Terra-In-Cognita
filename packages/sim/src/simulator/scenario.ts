// 시뮬레이터 시나리오 — docs/adr/2026-10-31-rules-simulator.md "세계 차리기"
// 세력·도시·유닛·처음 자산을 적는 시험 세계 설명이다(JSON 파일, packages/sim/scenarios/). 콘텐츠 팩 분류가 아니다:
// 국가 프리셋·아이템·레시피·시설의 팩 형식은 그 규칙을 만드는 단계(R2·R4)에서 정하고, 그때 이 설명이 팩 ID를 가리키게 된다.
// [임시] stub은 NPC 판단(무엇을 해 볼지)의 대리다. 결과는 진짜 규칙(R4b 세력·사회)이 정하고, 판단은 R5가 대신한다.
import type { Regime } from "../society/shares.ts";

export interface ScenarioFaction {
  /** 세력 코드 앞머리. count가 2 이상이면 code_01, code_02 … */
  readonly code: string;
  readonly count: number;
  /** 고정 세력(D-324: 기본 NPC 세력은 사라지지 않는다) */
  readonly fixed: boolean;
  /** 세력마다 처음 도시 수 */
  readonly cities: number;
  /** 세력마다 처음 일꾼 수(도시에 고르게 나눈다, 시험 직무 채집) */
  readonly workers: number;
  /** 처음 시험 화폐(최소 단위) */
  readonly credit: bigint;
  /** 처음 기술 단계 */
  readonly tech: number;
  /** 경제: 도시마다 놓는 시설(같은 도시의 일꾼을 앞에서부터 배치) */
  readonly cityPlan?: readonly ScenarioFacilityPlan[] | undefined;
  /** 경제: 도시마다 처음 창고 재고 */
  readonly stock?: readonly { readonly item: string; readonly qty: bigint }[] | undefined;
  /** 정권 체제(D-217). "mixed"면 세력 ID 차례로 셋을 돌린다([임시], 기본) */
  readonly regime: Regime | "mixed";
  /** 도시마다 휴먼 주거 수(기본: 도시당 일꾼 × 1.3 + 2) */
  readonly housing: number;
  /** 첫 도시 연구 시설 레벨(기본: min(5, tech)) */
  readonly researchLevel: number;
}

export interface ScenarioFacilityPlan {
  readonly facility: string;
  readonly recipe: string;
  readonly level: number;
  readonly workers: number;
}

/** 경제 손잡이(있으면 경제를 돌린다). [임시] 값은 시나리오 시험값이다 */
export interface ScenarioEconomy {
  /** 세력의 거래 판단 간격 */
  readonly tradeEveryMs: number;
  /** 환전 동시호가 회차 간격(E8 기존 환율 1시간) */
  readonly fxEveryMs: number;
  /** 운송 걸리는 시간(고정 속도 하나, 기술 순서 ADR 1절 N1 최소판) */
  readonly shipMs: number;
  /** 걸어 둔 물자 주문의 수명(E10 기획 잠정 실제 7일) */
  readonly orderLifeMs: number;
  /** 처음 발행량의 1인당 하루 거래액(E6) */
  readonly perCapitaDaily: bigint;
  /** 기준 통화가 아닌 나라가 처음 받는 기준 통화 준비금(처음 발행량의 만분율) */
  readonly baseReserveBp: number;
  /** 환전 로트 크기(화폐 최소 단위) */
  readonly fxLot: bigint;
}

/**
 * [임시] NPC 판단 대리(천분율·ms): 무엇을 해 볼지만 정한다. 결과(점령·반란·독립·기술·출생)는 진짜 규칙(R4b)이 정하고,
 * 판단은 R5(NPC 두뇌)가 대신한다
 */
export interface ScenarioStub {
  /** 세력 판단 간격(±25% 흔들림) */
  readonly decideEveryMs: number;
  /** 판단 한 번에 남의 도시를 치러 갈 확률 */
  readonly conquerPerMille: number;
  /** 판단 한 번에 가문이 갈라져 새 마을을 세울 확률(붐비는 도시가 있을 때) */
  readonly foundPerMille: number;
  /** 판단 한 번에 도시 지분 일부를 다른 세력에 팔 확률 */
  readonly shareSalePerMille: number;
  /** 판단 한 번에 연구 시설 레벨을 올릴 확률(국고가 있을 때) */
  readonly researchBuildPerMille: number;
  /** 판단 한 번에 봉신이 독립을 선언할 확률 */
  readonly vassalBreakPerMille: number;
}

/** 유닛마다 오가는 예약(합성 부하). 도착하면 쉬었다가 다음 목적지로 간다 */
export interface ScenarioTrips {
  readonly idleMinMs: number;
  readonly idleMaxMs: number;
}

/** 전투(있으면 도시 빼앗기를 공성 전투로 정하고 조우 전투를 연다). [임시] 값은 시나리오 시험값이다 */
export interface ScenarioCombat {
  /** 공성에 나서는 유닛 수(편마다) */
  readonly siegeUnits: number;
  /** 조우에 나서는 유닛 수(편마다) */
  readonly encounterUnits: number;
  /** 세력 판단 한 번에 조우가 생길 확률(천분율) */
  readonly encounterPerMille: number;
  /** 일반 전투맵 한 변(49 C3: 64) */
  readonly mapSize: number;
  /** 공성 전투맵 한 변(49 C3: 128) */
  readonly siegeMapSize: number;
  readonly nexusDurability: number;
}

/** 세력·사회 시뮬 손잡이([임시] 시나리오 시험값, 계수는 society/coefficients.ts. 배당·공물은 계수(팩 tuning)로 옮겼다) */
export interface ScenarioSociety {
  /** 반란 판정 뒤 그 도시를 다시 보지 않는 날 */
  readonly rebellionCooldownDays: number;
  /** 새 마을로 옮겨 가는 유닛 수, 세우는 값(국고 화폐 최소 단위) */
  readonly founders: number;
  readonly foundCost: bigint;
  /** 연구 시설 한 레벨 올리는 값(국고 화폐 최소 단위 × 레벨) */
  readonly researchBuildCost: bigint;
  /** 연구 시설 레벨 하나가 하루에 내는 연구 작업량 */
  readonly researchPerLevelDaily: number;
}

export interface Scenario {
  readonly id: string;
  /** 콘텐츠 팩 행성 ID(있으면 실행 도구가 팩에 있는지 본다) */
  readonly planet?: string | undefined;
  readonly factions: readonly ScenarioFaction[];
  readonly stub: ScenarioStub;
  readonly trips?: ScenarioTrips | undefined;
  readonly economy?: ScenarioEconomy | undefined;
  readonly combat?: ScenarioCombat | undefined;
  readonly society: ScenarioSociety;
}

const ID = /^[a-z][a-z0-9_]{1,47}$/;

class ScenarioError extends Error {}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Reflect.get(value, key)
    : undefined;
}

function int(value: unknown, path: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max)
    throw new ScenarioError(`${path}: integer in [${min}, ${max}] expected`);
  return value;
}

function optionalInt(
  value: unknown,
  path: string,
  min: number,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  return value === undefined ? fallback : int(value, path, min, max);
}

function regimeOf(value: unknown, path: string): Regime | "mixed" {
  if (value === undefined) return "mixed";
  if (value === "dictatorship" || value === "democracy" || value === "capitalism" || value === "mixed")
    return value;
  throw new ScenarioError(`${path}: dictatorship | democracy | capitalism | mixed expected`);
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !ID.test(value))
    throw new ScenarioError(`${path}: id (${ID.source}) expected`);
  return value;
}

function amount(value: unknown, path: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,30})$/.test(value))
    throw new ScenarioError(`${path}: non-negative integer string expected`);
  return BigInt(value);
}

/** JSON 값을 시나리오로 읽는다. 틀리면 경로가 붙은 오류를 던진다 */
export function parseScenario(value: unknown): Scenario {
  const id = text(field(value, "id"), "id");
  const planetValue = field(value, "planet");
  const planet = planetValue === undefined ? undefined : text(planetValue, "planet");
  const list: unknown = field(value, "factions");
  if (!Array.isArray(list) || list.length === 0)
    throw new ScenarioError("factions: non-empty array expected");
  const items: readonly unknown[] = list;
  const factions = items.map((item, index): ScenarioFaction => {
    const at = `factions[${index}]`;
    const fixed = field(item, "fixed");
    if (typeof fixed !== "boolean") throw new ScenarioError(`${at}.fixed: boolean expected`);
    return {
      code: text(field(item, "code"), `${at}.code`),
      count: int(field(item, "count"), `${at}.count`, 1, 999),
      fixed,
      cities: int(field(item, "cities"), `${at}.cities`, 1, 10_000),
      workers: int(field(item, "workers"), `${at}.workers`, 0, 1_000_000),
      credit: amount(field(item, "credit"), `${at}.credit`),
      tech: int(field(item, "tech"), `${at}.tech`, 1, 1000),
      cityPlan: optionalList(field(item, "cityPlan"), `${at}.cityPlan`, (plan, path) => ({
        facility: text(field(plan, "facility"), `${path}.facility`),
        recipe: text(field(plan, "recipe"), `${path}.recipe`),
        level: int(field(plan, "level"), `${path}.level`, 1, 5),
        workers: int(field(plan, "workers"), `${path}.workers`, 0, 100_000),
      })),
      stock: optionalList(field(item, "stock"), `${at}.stock`, (entry, path) => ({
        item: text(field(entry, "item"), `${path}.item`),
        qty: amount(field(entry, "qty"), `${path}.qty`),
      })),
      regime: regimeOf(field(item, "regime"), `${at}.regime`),
      housing: optionalInt(
        field(item, "housing"),
        `${at}.housing`,
        1,
        Math.floor(
          (Number(field(item, "workers") ?? 0) * 13) / (10 * Math.max(1, Number(field(item, "cities") ?? 1))),
        ) + 2,
      ),
      researchLevel: optionalInt(
        field(item, "researchLevel"),
        `${at}.researchLevel`,
        0,
        Math.min(5, Number(field(item, "tech") ?? 1)),
        5,
      ),
    };
  });
  const stubValue = field(value, "stub");
  const perMille = (key: string) => optionalInt(field(stubValue, key), `stub.${key}`, 0, 0, 1000);
  const stub: ScenarioStub = {
    decideEveryMs: int(field(stubValue, "decideEveryMs"), "stub.decideEveryMs", 60_000),
    conquerPerMille: int(field(stubValue, "conquerPerMille"), "stub.conquerPerMille", 0, 1000),
    foundPerMille: perMille("foundPerMille"),
    shareSalePerMille: perMille("shareSalePerMille"),
    researchBuildPerMille: perMille("researchBuildPerMille"),
    vassalBreakPerMille: perMille("vassalBreakPerMille"),
  };
  const societyValue = field(value, "society");
  const society: ScenarioSociety = {
    rebellionCooldownDays: optionalInt(
      field(societyValue, "rebellionCooldownDays"),
      "society.rebellionCooldownDays",
      0,
      3,
      365,
    ),
    founders: optionalInt(field(societyValue, "founders"), "society.founders", 1, 8, 10_000),
    foundCost:
      field(societyValue, "foundCost") === undefined
        ? 5000n
        : amount(field(societyValue, "foundCost"), "society.foundCost"),
    researchBuildCost:
      field(societyValue, "researchBuildCost") === undefined
        ? 2000n
        : amount(field(societyValue, "researchBuildCost"), "society.researchBuildCost"),
    researchPerLevelDaily: optionalInt(
      field(societyValue, "researchPerLevelDaily"),
      "society.researchPerLevelDaily",
      0,
      6000,
    ),
  };
  const tripsValue = field(value, "trips");
  let trips: ScenarioTrips | undefined;
  if (tripsValue !== undefined) {
    const idleMinMs = int(field(tripsValue, "idleMinMs"), "trips.idleMinMs", 0);
    trips = { idleMinMs, idleMaxMs: int(field(tripsValue, "idleMaxMs"), "trips.idleMaxMs", idleMinMs) };
  }
  const economyValue = field(value, "economy");
  const economy: ScenarioEconomy | undefined =
    economyValue === undefined
      ? undefined
      : {
          tradeEveryMs: int(field(economyValue, "tradeEveryMs"), "economy.tradeEveryMs", 60_000),
          fxEveryMs: int(field(economyValue, "fxEveryMs"), "economy.fxEveryMs", 60_000),
          shipMs: int(field(economyValue, "shipMs"), "economy.shipMs", 0),
          orderLifeMs: int(field(economyValue, "orderLifeMs"), "economy.orderLifeMs", 60_000),
          perCapitaDaily: amount(field(economyValue, "perCapitaDaily"), "economy.perCapitaDaily"),
          baseReserveBp: int(field(economyValue, "baseReserveBp"), "economy.baseReserveBp", 0, 1_000_000),
          fxLot: amount(field(economyValue, "fxLot"), "economy.fxLot"),
        };
  if (economy && economy.fxLot <= 0n) throw new ScenarioError("economy.fxLot: positive expected");
  const combatValue = field(value, "combat");
  const evenSize = (raw: unknown, path: string): number => {
    const size = int(raw, path, 32, 128);
    if (size % 2 !== 0) throw new ScenarioError(`${path}: even number expected`);
    return size;
  };
  const combat: ScenarioCombat | undefined =
    combatValue === undefined
      ? undefined
      : {
          siegeUnits: int(field(combatValue, "siegeUnits"), "combat.siegeUnits", 1, 250),
          encounterUnits: int(field(combatValue, "encounterUnits"), "combat.encounterUnits", 1, 100),
          encounterPerMille: int(
            field(combatValue, "encounterPerMille"),
            "combat.encounterPerMille",
            0,
            1000,
          ),
          mapSize: evenSize(field(combatValue, "mapSize"), "combat.mapSize"),
          siegeMapSize: evenSize(field(combatValue, "siegeMapSize"), "combat.siegeMapSize"),
          nexusDurability: int(field(combatValue, "nexusDurability"), "combat.nexusDurability", 1),
        };
  return { id, planet, factions, stub, trips, economy, combat, society };
}

function optionalList<T>(
  value: unknown,
  path: string,
  read: (item: unknown, path: string) => T,
): T[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ScenarioError(`${path}: array expected`);
  const items: readonly unknown[] = value;
  return items.map((item, index) => read(item, `${path}[${index}]`));
}
