// 물류센터(운반 대행 사업장) — 기획 D-555 1505("자동운반이란 어떤 유닛이든 실제로 옮겨야한다. 운반을 대행하는 서비스업종도 존재한다(물류센터같이)"),
// D-560(분류 저장·물류), D-564 1682(상업시설은 외주를 받아 장사), D-548(매출은 사업장 금고), D-570 1822(판매자가 정하고 적정가를 보인다), D-576(사용자 답
// 2213 "다": 기본은 운반 명령 때 물류센터를 직접 고르고, 설정으로 자동 맡기기를 켜면 같은 도시 물류센터에 자동으로 — 어느 곳은 기술 기본값 = 한 단위 요금이
// 가장 싼 곳). docs/adr/2026-11-16-logistics-center.md.
// - 물류센터 = 팩 시설 logistics(교통 단계, 일하는 자리 있음). 그 시설 일꾼(직무 배치·노동 계약)이 운반꾼이다 — 실제로 걷는 것은 gather/station.ts carry·
//   porter.ts(service). 이 모듈은 고를 수 있는 곳·요금·적정가·요금 내기만 맡는다.
// - 고를 수 있는 곳: 다 지은(레벨 1 이상)·일하는(상태 30% 이상)·멈추지 않은(적자 D-555 1504) 물류센터, 짐과 같은 도시·같은 2차맵. 받지 않는 곳(한 단위
//   요금 0)은 고를 수 없다(service_closed).
// - 요금(질문 2213 요금 단위 나): 한 단위(설정 칸 business_haul_unit_g × business_haul_unit_cells)마다 주인이 정한 값(business_price service:haul), 정하지
//   않았으면 적정가. 운반 한 번 = 한 단위 요금 × ⌈무게 ÷ 단위 무게⌉ × ⌈칸 ÷ 단위 칸⌉(@terra/shared/logistics). 떠날 때 물건 주인 지갑(바뀜 아래 — 그 나라
//   화폐)에서 그 사업장 금고로(장부 수입 haul_service, 소득세). 제 물류센터에 맡겨도 같다(D-555 1514).
// - 적정가(D-570 1822): 운반꾼 한 명의 시간당 인건비(그 물류센터 일꾼 시간당 인건비 합 ÷ 일꾼 수) × 한 단위 나르는 시간(@terra/sim haulMs — 단위 무게·단위
//   칸·운반꾼 하나) + 수수료(business_service_fee_pm) + 세금(그 사업장 소득세율).
// - 바뀜 (기획 대조 2277 — D-559 1524 "요금은 그 나라 화폐", 줄기 haul-2): 요금·적정가는 그 물류센터가 선 도시 주인 나라의 화폐다(attachMoney — 배 요금과
//   같은 읽기, 도시·경제가 없으면 서버 기준 화폐). 주인이 정한 한 단위 요금도 그 화폐 값이다. 적정가는 서버 기준 통화 눈금으로 센 뒤 지난 환전 체결가로
//   나라 화폐로 바꾼다(@terra/shared convertFair — 조선소 수리 적정가와 같다, 2158). 맡긴 사람 지갑의 그 화폐에서 내고, 모자라면 insufficient_funds.
// - 바뀜 (기획 대조 2272 — D-576 "설정으로 자동 맡기기", D-6012 계정별 설정 선례): 자동 맡기기는 계정 설정(user_settings.auto_haul — autoHaul.ts)이다.
//   명령에 via가 없으면 그 계정 설정을 따른다(auto — 켰을 때, 내 유닛이 없을 때만). via "own"은 이번 명령만 내 운반꾼만(attachPrefs).
// 정수·BigInt만 쓴다.
import { HAUL_SERVICE_ITEM, type HaulServiceView } from "@terra/shared/businessBooks";
import { type FairPrice, fairPriceView, laborCostOf } from "@terra/shared/fairPrice";
import { currencyCode } from "../market/fxViews.ts";
import { type HaulCenterView, cheapestCenter, haulFeeOf } from "@terra/shared/logistics";
import { type SocietyCoefficients, haulMs } from "@terra/sim";
import { hourlyFair } from "../business/fairPrice.ts";
import { type PlaceWorld, buildingPlace } from "../facilities/places.ts";
import type { CarryResult, CarrySpec } from "../gather/carrySpec.ts";

/** 운반 고리(gather/station.ts carry가 부른다) */
export interface HaulCarryHook {
  /**
   * 맡길 후보: via가 건물 ID면 그 물류센터가 이 짐을 받으면 [그 ID], 아니면 service_closed. auto면 같은 도시·2차맵의 받는 물류센터를 한 단위 요금이 싼
   * 차례로(같으면 건물 ID 차례, 없으면 빈 목록)
   */
  centers(
    via: number | "auto",
    spec: { readonly ownerId: number; readonly cityId: number; readonly mapKey: number },
  ): readonly number[] | "service_closed";
  /** 운반 한 번 요금(한 단위 요금 × 단위 수) */
  fee(centerId: number, grams: bigint, cells: number): bigint;
  /**
   * 요금을 낸다: 물건 주인 지갑(그 물류센터 나라 화폐) → 그 물류센터 금고(소득세). 모자라면 insufficient_funds. keep = 같은 화폐로 곧 낼 돈(사업장 사기의
   * 물건 값 — 요금을 낸 뒤에도 남아야 한다)
   */
  pay(
    ownerId: number,
    centerId: number,
    fee: bigint,
    atMs: number,
    keep?: { readonly asset: string; readonly amount: bigint },
  ): "insufficient_funds" | null;
  /** 명령에 via가 없을 때 그 주인의 계정 자동 맡기기(기획 대조 2272). 계정이 없거나(NPC) 설정을 모르면 false */
  auto(ownerId: number): boolean;
}

/** 요금 화폐(기획 대조 2277 — gather/world.ts가 세계 경제로 잇는다) */
export interface HaulMoney {
  /** 그 물류센터가 선 도시 주인 나라의 화폐(모르면 undefined — 서버 기준 화폐) */
  assetOf(buildingId: number): string | undefined;
  /** 서버 기준 통화 눈금 적정가 → 그 화폐 적정가(지난 환전 체결가, 없으면 같은 값) */
  toLocal(fair: FairPrice, asset: string): FairPrice;
}

/** 계정 자동 맡기기(autoHaul.ts) */
export interface HaulPrefs {
  /** 그 소유 주체의 계정이 켰나(계정이 없으면 끔) */
  on(ownerId: number): boolean;
  /** 그 계정 설정(설정 화면) */
  get(userId: string): Promise<boolean>;
  /** 바꾼다(DB 다음 메모리). 저장한 값 */
  set(userId: string, on: boolean): Promise<boolean>;
}

export interface HaulServiceDeps {
  places(): PlaceWorld | undefined;
  /** 그 건물이 일하나(상태 30% 이상 — 건물 서비스 works) */
  works(buildingId: number): boolean;
  /** 주인이 정한 값(사업장 값 표 — business/core.ts price). 없으면 undefined */
  price(buildingId: number, item: string): bigint | undefined;
  /** 그 사업장 소득세율(만분율) */
  taxRateOf(buildingId: number, ownerId: number): number;
  /** 멈춘 사업장인가(적자, D-555 1504) */
  suspended(buildingId: number): boolean;
  /** 그 물류센터 일꾼 시간당 인건비 합(labor/service.ts hourlyLabor) */
  laborHourly(buildingId: number): bigint;
  /** 그 물류센터 일꾼 수(직무 배치·열린 계약) */
  workerCount(buildingId: number): number;
  /** 지금 나를 수 있는 일꾼 수(gather/station.ts freeStaff). 없으면 일꾼 수 */
  freeStaff?: ((buildingId: number, mapKey: number, nowMs: number) => number) | undefined;
  rules(): SocietyCoefficients;
  /** 외주 요금 내기(business/commands.ts chargeService — 지갑 → 금고, 소득세). asset = 요금 화폐, keep = 낸 뒤에도 남아야 할 돈 */
  charge(
    ownerId: number,
    buildingId: number,
    fee: bigint,
    kind: string,
    atMs: number,
    asset: string,
    keep: bigint,
  ): "insufficient_funds" | null;
  /** 서버 기준 화폐(요금 화폐를 모를 때) */
  readonly fallbackAsset: string;
  now(): number;
}

export interface HaulService extends HaulCarryHook {
  /** 물류센터 시설인가(팩 logistics) */
  isCenter(buildingId: number): boolean;
  /** 한 단위 적정가(위 머리 주석) */
  fair(buildingId: number): FairPrice;
  /** 지금 받는 한 단위 요금(정한 값, 없으면 적정가)·정했는지 */
  rate(buildingId: number): { readonly perUnit: bigint; readonly set: boolean };
  /** 건물 판 [관리] 칸(물류센터가 아니면 undefined) */
  view(buildingId: number): HaulServiceView | undefined;
  /** 운반 명령 화면이 고르는 줄: 그 도시의 고를 수 있는 물류센터(받지 않는 곳도 "0"으로 보인다), 건물 ID 차례 */
  centersView(cityId: number, viewerOwnerId: number | undefined): HaulCenterView[];
  /** 요금 화폐(그 물류센터 나라 화폐, 모르면 서버 기준 화폐) */
  assetOf(buildingId: number): string;
  /** 요금 화폐를 잇는다(세계 경제가 서면 — gather/world.ts) */
  attachMoney(money: HaulMoney | undefined): void;
  /** 계정 자동 맡기기를 잇는다(autoHaul.ts — DB가 있는 세계) */
  attachPrefs(prefs: HaulPrefs | undefined): void;
  /** 이은 계정 자동 맡기기(설정 화면 tRPC — 없으면 undefined) */
  prefs(): HaulPrefs | undefined;
  /** 실제 운반 길을 잇는다(채집 세계의 station.carry — NPC 맡기기 npcOutsource.ts가 쓴다) */
  attachCarrier(carry: ((spec: CarrySpec) => CarryResult) | undefined): void;
  carrier(): ((spec: CarrySpec) => CarryResult) | undefined;
}

/** 단위 값(설정 칸 — 1보다 작으면 1) */
function unitOf(rules: SocietyCoefficients): { unitG: number; unitCells: number } {
  return {
    unitG: Math.max(1, Math.trunc(rules.business.haulUnitG)),
    unitCells: Math.max(1, Math.trunc(rules.business.haulUnitCells)),
  };
}

export function createHaulService(deps: HaulServiceDeps): HaulService {
  let money: HaulMoney | undefined;
  let prefs: HaulPrefs | undefined;
  let carrier: ((spec: CarrySpec) => CarryResult) | undefined;
  const assetOf = (buildingId: number): string => money?.assetOf(buildingId) ?? deps.fallbackAsset;
  const isCenter = (buildingId: number): boolean => {
    const world = deps.places();
    const record = world?.facilities.get(buildingId);
    return record !== undefined && world?.catalog().facility(record.facilityId)?.logistics === true;
  };

  const fair = (buildingId: number): FairPrice => {
    const rules = deps.rules();
    const { unitG, unitCells } = unitOf(rules);
    const workers = Math.max(1, deps.workerCount(buildingId));
    const perPorter = deps.laborHourly(buildingId) / BigInt(workers);
    const ownerId = (() => {
      const world = deps.places();
      return world ? (buildingPlace(world, buildingId)?.ownerId ?? null) : null;
    })();
    // 한 단위 나르는 시간(옮김 셈을 끄면 0 — 인건비 0)
    const ms = haulMs(BigInt(unitG), unitCells, 1, rules);
    const base = fairOf(perPorter, ms, rules, ownerId === null ? 0 : deps.taxRateOf(buildingId, ownerId));
    // 나라 화폐로(기획 대조 2277 — 서버 기준 화폐면 그대로)
    const asset = assetOf(buildingId);
    return money && asset !== deps.fallbackAsset ? money.toLocal(base, asset) : base;
  };

  const rate = (buildingId: number): { perUnit: bigint; set: boolean } => {
    const set = deps.price(buildingId, HAUL_SERVICE_ITEM);
    return set === undefined ? { perUnit: fair(buildingId).price, set: false } : { perUnit: set, set: true };
  };

  /** 고를 수 있는 물류센터인가(위 머리 주석 — 요금은 보지 않는다) */
  const open = (buildingId: number, cityId: number, mapKey: number): boolean => {
    const world = deps.places();
    const record = world?.facilities.get(buildingId);
    if (!world || !record || record.level < 1 || !isCenter(buildingId)) return false;
    if (!deps.works(buildingId) || deps.suspended(buildingId)) return false;
    const place = buildingPlace(world, buildingId);
    return (
      place !== undefined && place.ownerId !== null && place.cityId === cityId && place.mapKey === mapKey
    );
  };

  /** 그 도시·2차맵의 고를 수 있는 물류센터(건물 ID 차례) */
  const inCity = (cityId: number, mapKey: number | undefined): number[] => {
    const world = deps.places();
    if (!world) return [];
    const out: number[] = [];
    for (const record of world.facilities.values()) {
      if (record.cityId !== cityId && record.cityId !== null) continue;
      const place = buildingPlace(world, record.buildingId);
      if (!place || (mapKey !== undefined && place.mapKey !== mapKey)) continue;
      if (open(record.buildingId, cityId, place.mapKey)) out.push(record.buildingId);
    }
    return out.toSorted((a, b) => a - b);
  };

  return {
    isCenter,
    fair,
    rate,
    centers(via, spec) {
      if (via !== "auto") {
        if (!open(via, spec.cityId, spec.mapKey) || rate(via).perUnit <= 0n) return "service_closed";
        return [via];
      }
      const priced = inCity(spec.cityId, spec.mapKey).map((buildingId) => ({
        buildingId,
        perUnit: rate(buildingId).perUnit,
      }));
      const out: number[] = [];
      // 싼 차례(같으면 건물 ID): 가장 싼 곳을 하나씩 뺀다(물류센터 수는 작다)
      let left = priced;
      for (;;) {
        const best = cheapestCenter(left);
        if (!best) break;
        out.push(best.buildingId);
        left = left.filter((entry) => entry.buildingId !== best.buildingId);
      }
      return out;
    },
    fee(centerId, grams, cells) {
      const { unitG, unitCells } = unitOf(deps.rules());
      return haulFeeOf(rate(centerId).perUnit, grams, cells, unitG, unitCells);
    },
    pay(ownerId, centerId, fee, atMs, keep) {
      const asset = assetOf(centerId);
      return deps.charge(
        ownerId,
        centerId,
        fee,
        "haul_service",
        atMs,
        asset,
        keep?.asset === asset ? keep.amount : 0n,
      );
    },
    auto: (ownerId) => prefs?.on(ownerId) ?? false,
    assetOf,
    attachMoney(next) {
      money = next;
    },
    attachPrefs(next) {
      prefs = next;
    },
    prefs: () => prefs,
    attachCarrier(next) {
      carrier = next;
    },
    carrier: () => carrier,
    view(buildingId) {
      if (!isCenter(buildingId)) return undefined;
      const { unitG, unitCells } = unitOf(deps.rules());
      const current = rate(buildingId);
      const world = deps.places();
      const mapKey = world ? buildingPlace(world, buildingId)?.mapKey : undefined;
      return {
        perUnit: current.set ? String(current.perUnit) : null,
        charged: String(current.perUnit),
        fair: fairPriceView(fair(buildingId)),
        unitG,
        unitCells,
        workers:
          mapKey === undefined
            ? 0
            : (deps.freeStaff?.(buildingId, mapKey, deps.now()) ?? deps.workerCount(buildingId)),
        currency: currencyCode(assetOf(buildingId)),
      };
    },
    centersView(cityId, viewerOwnerId) {
      const world = deps.places();
      if (!world) return [];
      const { unitG, unitCells } = unitOf(deps.rules());
      return inCity(cityId, undefined).map((buildingId) => {
        const place = buildingPlace(world, buildingId);
        const mapKey = place?.mapKey;
        return {
          buildingId,
          mine: viewerOwnerId !== undefined && place?.ownerId === viewerOwnerId,
          perUnit: String(rate(buildingId).perUnit),
          workers:
            mapKey === undefined
              ? 0
              : (deps.freeStaff?.(buildingId, mapKey, deps.now()) ?? deps.workerCount(buildingId)),
          unitG,
          unitCells,
          currency: currencyCode(assetOf(buildingId)),
        };
      });
    },
  };
}

/** 한 단위 적정가: 운반꾼 한 명 인건비 × 한 단위 시간 + 수수료 + 세금 */
function fairOf(
  perPorterHourly: bigint,
  unitMs: number,
  rules: SocietyCoefficients,
  taxBp: number,
): FairPrice {
  return hourlyFair(laborCostOf(perPorterHourly, unitMs), {
    feePm: rules.business.serviceFeePm,
    taxBp,
  });
}
