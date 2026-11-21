// 주민세 과세 재산 값(서버 고리) — 기획 D-579(바탕 = 재산: 주거·사업장 등, 임금 아님), docs/adr/2026-11-15-business-ledger.md "바뀜 (D-579)"·"바뀜 (tax-2 …)".
// 규칙(누가·얼마·빚)은 @terra/sim society/residentTax.ts이고 하루 끝 사회 규칙(societyPayouts collectResidentTax)이 부른다. 여기는 값만 빌려 준다.
// 바뀜(tax-2, 질문 2371 나 — "주거와 다른 자산(사업장 등)" = 건물, 건물 값 = 지은 값(재료 시세 + 돈)이 기술 기본값, 감가 등 세부도 기술 기본값·설정 칸):
// - 건물 값 = 지은 값 × resident_building_value_pm ÷ 1000 × 감가 ÷ 1000. 지은 값 = 레벨 1부터 지금 레벨까지 짓기 재료(@terra/shared facilityBuild buildCostAt)
//   × 그 도시 거래소 시세(그 나라 화폐 마지막 체결가 — 없거나 다른 화폐면 팩 시작 시세, @terra/sim necessityCost와 같은 셈. 읽기만 — 거래소를 만들지 않는다).
//   짓기에 드는 돈은 지금 없다(D-171 — 짓기 비용은 재료뿐)라 재료 값만이다. 감가 = max(바닥, 1000 − 지은 뒤 날 수 × 하루 감가)(설정 칸 resident_building_*).
// - 옛 [임시](사업장 금고 잔고)는 뺐다: 금고 돈은 건물이 아니라 화폐 자산이다(질문 2371 다 "랭킹 자산 셈 전부"의 몫 — 고르지 않았다).
// 바뀜(tax-2, D-581 — 질문 2372 "둘 다"): 내는 쪽이 둘이다.
// - 사업장 몫(residentProperty): 그 주인이 그 도시에 가진 주거 아닌 건물(생활 단계가 아닌 시설 — 사업장·창고 등) 값의 합. 주인 지갑에서 낸다.
// - 집 몫(residentHomes): 그 도시에 사는 유닛(거주 = 숙소 배정·도시 주거)마다 사는 숙소 값 ÷ 그 숙소에 사는 사람 수. 유닛 지갑에서 낸다. 숙소 없는 집(도시
//   주거 수 — 건물이 없다)은 집 값 0. 숙소(주거) 건물은 사는 사람의 집 몫으로만 세고 숙소 주인의 사업장 몫에는 넣지 않는다(두 번 걷지 않게 — 기술 기본값,
//   질문 2422).
// - 거주: NPC 휴먼 = 그 도시에 사는 휴먼(사는 도시 SimUnit.city — 떠도는 사람은 도시가 없다), 숙소 = 도시 경제 쉼터 계획(cityRest.ts plan — 일꾼만 숙소를
//   받는다). 플레이어 유닛 = 그 도시 일터의 숙소 배정이 있는 일꾼(labor/workerRest.ts — registerPlayerHomes로 원장에 붙는다). 숙소 없이 집으로 쉬는
//   플레이어 일꾼은 그 도시 주거 수에 들지 않아 거주로 보지 않는다(cityRest.ts planPlayerRest 머리 주석).
// - 지분이 팔린 사업장도 건물 주인 몫으로 센다(건물은 주인 것 — 지분은 금고 몫을 나눈다).
// 세율 0이면 사회 규칙이 이 고리를 부르지 않는다(건물 훑기 없음). 부를 때마다 도시별로 한 번만 훑어 표로 든다.
import { type FacilityBuildJson, buildCostAt } from "@terra/shared/facilityBuild";
import {
  type BusinessCoefficients,
  type Economy,
  type ResidentHome,
  type SimHooks,
  type SimUnit,
  type SocietyCoefficients,
  cityWorkerUnits,
  necessityCost,
} from "@terra/sim";
import type { FacilityRecord } from "../facilities/state.ts";
import type { CityRestPlan } from "./cityRest.ts";

const DAY_MS = 86_400_000;
/** 생활 단계 시설(숙소 — 팩 facilities stage "living") */
const LIVING_STAGE = "living";

/** 그 도시에 선 건물 하나(다 지은 것) */
export interface ResidentBuilding {
  readonly buildingId: number;
  readonly facility: string;
  readonly level: number;
  readonly ownerId: number | null;
  readonly builtAtMs: number;
  /** 주거(숙소) 건물 — 사는 사람의 집 몫으로만 센다 */
  readonly living: boolean;
}

/** 그 도시에 사는 유닛 하나와 사는 숙소(없으면 null — 숙소 없는 집) */
export interface ResidentUnit {
  readonly unit: number;
  readonly owner: number;
  readonly lodging: number | null;
}

export interface ResidentPropertySource {
  /** 그 도시에 선 건물(다 지은 것 — 레벨 1 이상) */
  buildingsIn(cityId: number): Iterable<ResidentBuilding>;
  /** 그 도시에 사는 유닛(거주). 없으면 집 몫 고리를 얹지 않는다(시뮬 세계 사는 도시·집 값 0) */
  residentsIn?: ((cityId: number) => Iterable<ResidentUnit>) | undefined;
  /** 시설 ID → 짓기 칸(모르면 undefined — 값 0) */
  buildOf(facility: string): FacilityBuildJson | undefined;
  /** 그 도시·화폐에서 자산(item:<ID>) 기본 단위 qty의 값(읽기만) */
  priceOf(cityId: number, asset: string, currency: string, qty: bigint): bigint;
  /** 사업장 설정 칸(건물 값·감가) */
  rules(): Pick<
    BusinessCoefficients,
    "residentBuildingValuePm" | "residentBuildingDepreciationPm" | "residentBuildingFloorPm"
  >;
}

const clampPm = (value: number | undefined, fallback: number, max = 1000): bigint =>
  BigInt(Math.min(max, Math.max(0, Math.trunc(value ?? fallback))));

/** 감가 ‰ = max(바닥, 1000 − 날 수 × 하루 감가), 0~1000 */
export function depreciationPm(ageMs: number, perDayPm: number, floorPm: number): bigint {
  const days = BigInt(Math.max(0, Math.floor(ageMs / DAY_MS)));
  const floor = clampPm(floorPm, 0);
  const left = 1000n - days * clampPm(perDayPm, 0);
  return left > floor ? left : floor;
}

/** 걷는 차례 한 번의 값 셈: 사업장 몫((주인, 도시, 화폐) → 값)과 집 몫(도시, 화폐 → 사는 유닛과 집 값). 도시 건물 목록·지은 값은 한 번만 센다 */
export function residentValuer(
  source: ResidentPropertySource,
  nowMs: number,
): {
  readonly business: (payer: number, city: number, asset: string) => bigint;
  readonly homes: (city: number, asset: string) => ResidentHome[];
} {
  const rules = source.rules();
  const valuePm = clampPm(rules.residentBuildingValuePm, 1000, 10_000);
  const byCity = new Map<number, readonly ResidentBuilding[]>();
  const costs = new Map<string, bigint>();
  const buildingsOf = (city: number): readonly ResidentBuilding[] => {
    let list = byCity.get(city);
    if (!list) {
      list = [...source.buildingsIn(city)];
      byCity.set(city, list);
    }
    return list;
  };
  /** 지은 값(레벨 1~level 재료 × 시세) — (도시, 시설, 레벨, 화폐)마다 한 번 */
  const builtCost = (city: number, facility: string, level: number, asset: string): bigint => {
    const key = `${city}|${facility}|${level}|${asset}`;
    const known = costs.get(key);
    if (known !== undefined) return known;
    const build = source.buildOf(facility);
    let sum = 0n;
    if (build)
      for (let l = 1; l <= level; l++)
        for (const stack of buildCostAt(build, l))
          sum += source.priceOf(city, `item:${stack.item}`, asset, BigInt(stack.qty));
    costs.set(key, sum);
    return sum;
  };
  const valueOf = (city: number, entry: ResidentBuilding, asset: string): bigint => {
    if (entry.level < 1) return 0n;
    const cost = builtCost(city, entry.facility, entry.level, asset);
    if (cost <= 0n) return 0n;
    const dep = depreciationPm(
      nowMs - entry.builtAtMs,
      rules.residentBuildingDepreciationPm ?? 0,
      rules.residentBuildingFloorPm ?? 0,
    );
    return (((cost * valuePm) / 1000n) * dep) / 1000n;
  };
  return {
    business: (payer, city, asset) => {
      let sum = 0n;
      for (const entry of buildingsOf(city))
        if (entry.ownerId === payer && !entry.living) sum += valueOf(city, entry, asset);
      return sum;
    },
    homes: (city, asset) => {
      const residents = [...(source.residentsIn?.(city) ?? [])];
      const count = new Map<number, number>();
      for (const resident of residents)
        if (resident.lodging !== null) count.set(resident.lodging, (count.get(resident.lodging) ?? 0) + 1);
      const lodgings = new Map(buildingsOf(city).map((entry) => [entry.buildingId, entry]));
      return residents.map((resident) => {
        const lodging = resident.lodging === null ? undefined : lodgings.get(resident.lodging);
        const share = BigInt(Math.max(1, count.get(resident.lodging ?? -1) ?? 1));
        return {
          unit: resident.unit,
          owner: resident.owner,
          housing: lodging ? valueOf(city, lodging, asset) / share : 0n,
        };
      });
    },
  };
}

/** 고리에 주민세 재산 값을 얹는다(건물·시세 출처가 없으면 그대로 — 걷지 않는다). 사는 유닛 출처가 있으면 집 몫도 */
export function withResidentProperty(base: SimHooks, source: ResidentPropertySource | undefined): SimHooks {
  if (!source) return base;
  let last: { nowMs: number; valuer: ReturnType<typeof residentValuer> } | undefined;
  const valuerAt = (nowMs: number): ReturnType<typeof residentValuer> => {
    if (last?.nowMs !== nowMs) last = { nowMs, valuer: residentValuer(source, nowMs) };
    return last.valuer;
  };
  return {
    ...base,
    residentProperty: (nowMs) => valuerAt(nowMs).business,
    ...(source.residentsIn ? { residentHomes: (nowMs: number) => valuerAt(nowMs).homes } : {}),
  };
}

/** 플레이어 일꾼의 거주(도시 → 숙소에 사는 유닛) — labor/workerRest.ts가 원장에 붙인다 */
export type PlayerHomes = (cityId: number) => readonly ResidentUnit[];
const playerHomes = new WeakMap<object, PlayerHomes>();

/** 플레이어 일꾼 거주 출처를 원장에 붙인다(마지막에 붙인 것이 이긴다 — 세계 하나에 하나) */
export function registerPlayerHomes(ledger: object, homes: PlayerHomes): void {
  playerHomes.set(ledger, homes);
}

/** 세계 몫(건물 서비스·2차맵·시설 목록 — npc/cityBuild.ts NpcBuildWorld와 같은 꼴) */
export interface ResidentWorld {
  readonly service: { readonly facilities: ReadonlyMap<number, FacilityRecord> };
  readonly catalog: () => {
    facility(
      id: string,
    ): { readonly build: FacilityBuildJson | undefined; readonly stage: string } | undefined;
  };
  readonly maps: ReadonlyMap<number, { buildingOwner(buildingId: number): number | null | undefined }>;
}

/** 도시 경제 몫(시세·일꾼 나누기·쉼터 계획) */
export interface ResidentEconomy {
  readonly economy: Pick<Economy, "markets" | "catalog" | "facilities">;
  restPlan?(cityId: number): CityRestPlan | undefined;
}

/** 쉼터 계획의 일꾼 → 숙소(시설 안 차례 "시설ID:차례" — npcWages.ts restsByWorker와 같은 맞춤) */
function lodgingByWorker(plan: CityRestPlan | undefined): Map<string, number | null> {
  const out = new Map<string, number | null>();
  const next = new Map<number, number>();
  for (const rest of plan?.workers ?? []) {
    const index = next.get(rest.facilityId) ?? 0;
    next.set(rest.facilityId, index + 1);
    out.set(`${rest.facilityId}:${index}`, rest.lodgingId);
  }
  return out;
}

/** 런타임 몫으로 재산 값 출처를 만든다(건물 서비스나 도시 경제가 없으면 undefined — 걷지 않는다) */
export function residentSourceOf(
  world: ResidentWorld | undefined,
  econ: ResidentEconomy | undefined,
  rules: () => SocietyCoefficients,
  o: {
    /** NPC 사회 런타임 거울 세계(사는 도시·경비대). 없으면 집 몫 고리를 얹지 않는다 */
    readonly sim?:
      | { readonly units: ReadonlyMap<number, Pick<SimUnit, "id" | "owner" | "city" | "guard">> }
      | undefined;
    /** 원장(플레이어 일꾼 거주 출처를 찾는다) */
    readonly ledger?: object | undefined;
  } = {},
): ResidentPropertySource | undefined {
  if (!world || !econ) return undefined;
  const ownerOf = (buildingId: number): number | null => {
    for (const map of world.maps.values()) {
      const owner = map.buildingOwner(buildingId);
      if (owner !== undefined) return owner;
    }
    return null;
  };
  const sim = o.sim;
  return {
    *buildingsIn(cityId) {
      for (const record of world.service.facilities.values())
        if (record.cityId === cityId && record.level >= 1)
          yield {
            buildingId: record.buildingId,
            facility: record.facilityId,
            level: record.level,
            ownerId: ownerOf(record.buildingId),
            builtAtMs: record.builtAtMs,
            living: world.catalog().facility(record.facilityId)?.stage === LIVING_STAGE,
          };
    },
    ...(sim
      ? {
          *residentsIn(cityId: number): Iterable<ResidentUnit> {
            // NPC 휴먼: 그 도시에 사는 휴먼, 일꾼이면 쉼터 계획의 숙소
            const rests = lodgingByWorker(econ.restPlan?.(cityId));
            const lodgingOf = new Map<number, number | null>();
            for (const worker of cityWorkerUnits(sim, econ.economy, cityId))
              lodgingOf.set(worker.unitId, rests.get(`${worker.facilityId}:${worker.index}`) ?? null);
            for (const unit of sim.units.values())
              if (unit.city === cityId)
                yield { unit: unit.id, owner: unit.owner, lodging: lodgingOf.get(unit.id) ?? null };
            // 플레이어 일꾼: 그 도시 숙소 배정이 있는 유닛
            const players = o.ledger ? playerHomes.get(o.ledger) : undefined;
            if (players) yield* players(cityId);
          },
        }
      : {}),
    buildOf: (facility) => world.catalog().facility(facility)?.build,
    // 거래소 표는 get이 거래소를 만든다 — necessityCost가 has로 먼저 본다(읽기만)
    priceOf: (cityId, asset, currency, qty) => necessityCost(econ.economy, cityId, asset, currency, qty),
    rules: () => rules().business,
  };
}
