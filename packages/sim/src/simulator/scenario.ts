// 시뮬레이터 시나리오 — docs/adr/2026-10-31-rules-simulator.md "세계 차리기"
// 세력·도시·유닛·처음 자산을 적는 시험 세계 설명이다(JSON 파일, packages/sim/scenarios/). 콘텐츠 팩 분류가 아니다:
// 국가 프리셋·아이템·레시피·시설의 팩 형식은 그 규칙을 만드는 단계(R2·R4)에서 정하고, 그때 이 설명이 팩 ID를 가리키게 된다.
// [임시] stub(대리 규칙)은 기록기를 움직여 보려는 자리 표시다. 게임 규칙이 아니고 결과를 D-391 판단에 쓰지 않는다.

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

/** [임시] 대리 규칙 손잡이(천분율·ms). R4·R5의 진짜 규칙이 대신한다 */
export interface ScenarioStub {
  /** 세력 판단 간격(±25% 흔들림) */
  readonly decideEveryMs: number;
  /** 판단 한 번에 남의 도시를 빼앗을 확률 */
  readonly conquerPerMille: number;
  /** 판단 한 번에 도시 하나가 반란으로 갈라질 확률(도시 2개 이상일 때) */
  readonly rebelPerMille: number;
  readonly techUpPerMille: number;
  readonly techDownPerMille: number;
  readonly techMax: number;
}

/** 유닛마다 오가는 예약(합성 부하). 도착하면 쉬었다가 다음 목적지로 간다 */
export interface ScenarioTrips {
  readonly idleMinMs: number;
  readonly idleMaxMs: number;
}

export interface Scenario {
  readonly id: string;
  /** 콘텐츠 팩 행성 ID(있으면 실행 도구가 팩에 있는지 본다) */
  readonly planet?: string | undefined;
  readonly factions: readonly ScenarioFaction[];
  readonly stub: ScenarioStub;
  readonly trips?: ScenarioTrips | undefined;
  readonly economy?: ScenarioEconomy | undefined;
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
    };
  });
  const stubValue = field(value, "stub");
  const stub: ScenarioStub = {
    decideEveryMs: int(field(stubValue, "decideEveryMs"), "stub.decideEveryMs", 60_000),
    conquerPerMille: int(field(stubValue, "conquerPerMille"), "stub.conquerPerMille", 0, 1000),
    rebelPerMille: int(field(stubValue, "rebelPerMille"), "stub.rebelPerMille", 0, 1000),
    techUpPerMille: int(field(stubValue, "techUpPerMille"), "stub.techUpPerMille", 0, 1000),
    techDownPerMille: int(field(stubValue, "techDownPerMille"), "stub.techDownPerMille", 0, 1000),
    techMax: int(field(stubValue, "techMax"), "stub.techMax", 1, 1000),
  };
  if (stub.conquerPerMille + stub.rebelPerMille > 1000)
    throw new ScenarioError("stub: conquerPerMille + rebelPerMille must be <= 1000");
  if (stub.techUpPerMille + stub.techDownPerMille > 1000)
    throw new ScenarioError("stub: techUpPerMille + techDownPerMille must be <= 1000");
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
  return { id, planet, factions, stub, trips, economy };
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
