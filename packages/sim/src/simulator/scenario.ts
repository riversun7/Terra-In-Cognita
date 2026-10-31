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
  return { id, planet, factions, stub, trips };
}
