// 채집소(벌목장·광산) — 사용자 지적(2026-11-08) "원자재채집소의 기능도 필요", 사용자 답 D-519(원문은 docs/adr/2026-11-07-gather-objects.md 배경)
// "오브젝트가 몰린곳에 광산이나 벌목소를 통해 빠르게 저장하고 버프(피로도 소모감소, 건물 등급에 따른 채집량 등, 오브젝트 빠른 재생 등) 임금 등의
// 시스템도 활용 가능". ADR "바뀜 (2026-11-08 사용자 지적: 채집소 기능)".
// - 채집소 = 팩 gather가 있는 시설. 원자재 오브젝트 종류가 맡는 시설(gather_objects facility — 벌목장·광산)은 "objects" 채집소, 맡는 오브젝트가
//   없는 채집 시설(농장 — 뒤에 목장 등)은 "facility" 채집소다. 기획 정리 756 ②(D-523 포인터, "농장도 창고·버프"): facility 채집소도 채집소 창고·
//   수확·피로 버프·자동 옮김을 받는다. 오브젝트가 없으니 반경·다시 자람 버프와 "반경 안 오브젝트가 있어야 낸다"는 규칙은 없고, 산출 규칙(선택 모드
//   D-507 등)은 그대로다.
// - 1차 생산 여섯 가지가 모두 땅에 묶인 자리를 맡는다(docs/adr/2026-11-11-city-catchment.md): 팩 core@66부터 농장·목장·낚시터도 밭·목초지·
//   물터(gather_objects source plot)를 맡아 "objects" 채집소다 — 반경 안 자리 번수가 일꾼 묶음 상한이다(다른 채집소·다른 도시와 같은 칸을
//   다툰다). "facility" 채집소는 맡는 오브젝트 종류가 없는 채집 시설(덮어쓰기·시험 팩)에 남는다.
// - 바뀜 (기획 D-567 "허브약초원 농장 목장은 건물 채집소로 하자"): 선택 방식(gather mode "select" — 농장·목장·약초원)은 건물 안에서 기르는
//   "facility" 채집소다. 2차맵 오브젝트(밭·목초지·약초 덤불·야생 곡물 등)를 쓰지 않고(반경 안 번수 상한 없음), 산출은 건물 레벨 최고 티어 ×
//   일꾼 효율 × 면적 모듈(labor/gatherWork.ts). 야생 약초·야생 곡물 오브젝트는 직접 채집용으로 남는다(D-552).
// - 일꾼(직무 배치·노동 계약, 같은 2차맵 522 ①)은 소유 주체 정산(labor/workBook.ts goodsFor → 이 고리)에서 묶음마다 반경 안 오브젝트 번수를
//   하나씩 쓴다(objects 채집소만, 가까운 것부터, 질문 664 ②). 남은 번수가 없으면 그 묶음을 끝내지 못하고 진행은 묶음 하나 몫까지만 쌓인다. 레벨
//   수확 버프를 곱하고(‰ 나머지는 결정적 굴림), 산출은 채집소 창고(그 건물 창고, 상한 = 팩 storageKg × 레벨)로 간다. 창고가 가득이면 묶음을
//   끝내지 않는다(두 종류 모두).
// - 피로 덜기: 일한 주기 피로(주기마다 1점, @terra/sim 직무 규칙)에서 (1000 − 레벨 피로 배율)‰을 정산 뒤에 덜어 준다. 오브젝트·창고에 막혀 묶음을
//   하나도 못 끝낸 구간은 기다림이라 피로를 모두 덜어 준다. 나머지 ‰은 메모리에 들고 다음 정산에 더한다.
// - 자동 옮김: 설정 칸 간격(gather_obj_station_haul_ms)의 정시마다 채집소 창고의 주인 몫 물자를 그 도시의 주인 도시 창고로 옮긴다(거래 하나,
//   kind station_haul). 임대형 임차인 몫은 그대로(유예 규칙). 손으로는 이미 있는 창고 꺼내기(storage_move out)로 옮긴다.
//   바뀜 (기획 D-569 1781): 주인 몫은 사업장 물건이라 자동 옮김은 주인 자동 구매다(ownerSale — 판매가, 지갑이 되는 만큼, 값 0이면 옮기지 않음). 손으로는
//   storage_move out이 아니라 business_buy(판매가)로 산다. 기본값은 자동 옮김 끔(설정 칸 0, D-555 1505).
// - 옮김 거리(질문 1050 가, D-533 "창고와 원자재채집소와의 관계", 기획 43 §7.1 직접 운반·§7.3)와 운반꾼(질문 1090 가·1092 가·1091 가, D-534):
//   거리가 있으면 보이는 운반꾼(그 채집소 일꾼 하나, porter.ts)이 정시에 주인 몫을 화물로 싣고 걸어 나른다 — 물건은 채집소 창고에서 운반꾼 화물로
//   옮겨 채집소 창고 자리가 바로 빈다. 걸리는 시간은 옛 셈(@terra/sim haulMs — 무게 ÷ 화물 상한 gather_obj_carry_g 횟수 × 왕복 2 × 칸 × 걷기 ms,
//   나르는 사람 = 운반꾼 하나 [임시]) 그대로, 닿는 시각에 화물에 남은 만큼 도시 창고에 넣는다. 칸 = 채집소 가운데 → 그 도시에 선 주인의 가장 가까운
//   창고(창고 단계, 일하는 것) 가운데, 창고가 없으면 도시 칸(체비셰프). 나르는 동안 그 채집소는 다음 정시를 건너뛴다. 운반꾼으로 쓸 일꾼이 없으면
//   물건은 채집소 창고에서 기다린다 [임시]. 손으로 옮기기(창고 꺼내기 storage_move out, haulOut)도 같은 운반꾼·시간이다. 옮김 셈을 끄면
//   (haul_distance_mode 0) 또는 거리 0이면 예전처럼 바로.
// - 바뀜 (기획 D-569 1781·1784 "거래소 반입은 실제 운반만 — 우회 길 없음"): 손으로 옮기기(haulOut)는 채집소가 아닌 시설 건물(창고 시설·임대 몫·
//   사업장)에도 맡는다 — 예전에는 운반꾼 없이 바로 옮겼다. 운반꾼은 그 건물 일꾼, 없으면 받을 사람의 그 2차맵 유닛(porter.ts ownUnits). 사업장 판매
//   (business_buy)도 같은 길이다: 판 사람의 건물 창고 물건을 산 사람의 도시 창고로(sellerId). 길 = 그 건물 가운데 → 받을 사람의 가장 가까운 다른
//   창고, 없으면 도시 칸. 운반꾼이 없으면 unknown_unit·unit_busy(물건은 건물 창고에 그대로).
// - 거래소 넣기(haulIn, 기획 D-564 1628·D-569 1784, docs/adr/2026-11-16-exchange-buildings.md): 도시 창고 → 물자 거래소 건물 창고도 운반꾼(받을 사람의 그
//   2차맵 유닛 — 거래소 건물에는 일꾼 자리가 없다)이 도시 칸 → 건물 가운데를 같은 셈 시간으로 나른다. 옮김 셈 끔·거리 0이면 바로(exchange_deposit).
//   바뀜 (질문 2084, 줄기 exchange-3): 그 거래소에서 나를 위해 일하는 거래 직무 유닛(사이보그 본체도)이 먼저 나르고, 그 유닛이 나르면 시간이 설정 칸
//   exchange_desk_haul_pm 배(haulTime). 묶음 1116n부터 거래소 넣기도 아래 carry 한 길이다.
// - 배 상하역(기획 D-555 1505 "어떤 유닛이든 실제로 옮겨야", boats/cargo.ts): 거래소 넣기와 같은 운반 하나(carry)로 배 창고 ↔ 항구 옆 거래소 건물 창고·
//   도시 창고를 나른다. 운반꾼은 그 배 시설 일꾼 → 배 주인의 그 2차맵 유닛(배에 탄 유닛은 빼낸다 — gather/world.ts ownUnits).
// - 물류센터(운반 대행, 기획 D-555 1505·D-576, docs/adr/2026-11-16-logistics-center.md): 명령이 물류센터를 고르면(CarrySpec via = 건물 ID) 그 물류센터 일꾼만
//   운반꾼이 되고(porter.ts pick service), 떠날 때 요금(한 단위 요금 × 단위 수, logistics/haulService.ts)을 물건 주인 지갑에서 그 사업장 금고로 낸다.
//   via = auto(설정의 자동 맡기기)는 내 운반꾼이 없을 때만 같은 도시의 받는 물류센터를 한 단위 요금이 싼 차례로 본다(나를 일꾼이 있는 첫 곳). 짐의 건물 =
//   그 물류센터(합치기·닿는 시각은 같은 셈). 바뀜 (기획 대조 2272·2273, 줄기 haul-2): via가 없으면 계정 자동 맡기기(haulService.auto)를 따르고 "own"은 내
//   운반꾼만. 창고 꺼내기·사업장 판매 운반(haulOut)도 같은 carry 한 길이다(판 사람 몫은 sellerId, 사기 값은 keep — 요금을 낸 뒤에도 남게).
// - 오브젝트 규칙(기획 D-552 "직접 채집과 일꾼 채집이 같은 규칙", docs/adr/2026-11-15-gather-object-tiers.md): objects 채집소 일꾼의 k번째 묶음은
//   번수를 쓸 차례(가까운 것부터)의 k번째 오브젝트 규칙(사다리·티어 범위·대표 아이템·굴림표 — objectYield.ts objectRollOf)으로 굴린다(lotRoll).
// [임시] 일꾼 상태·끝낸 묶음 수·피로 나머지는 메모리에만 있다(다시 켜면 0부터). 정산이 길게 밀리면(오프라인) 그 사이 다시 자란 번수는 세지 못하고
// 정산하는 때의 남은 번수만 쓴다(기획 정리: 750~755·757 지금 코드). facility 채집소 버프는 objects 채집소와 같은 설정 칸을 쓴다(확인 대기 810~813).
// 정수 연산만 쓴다(판정 코드 규칙).
import type { SocietyCoefficients } from "@terra/sim";
import { PHASE_REST, footprintRect, haulMs, haulOn, mix32 } from "@terra/sim";
import type { FacilityResultCode } from "@terra/protocol";
import { buildingLocation, cargoLocation, cityLocation } from "@terra/shared/goodsPlaces";
import type { Ledger } from "../economy/ledger.ts";
import { type PlaceWorld, assetWeightG, buildingCell, buildingPlace } from "../facilities/places.ts";
import type { StationHook, StationPlan } from "../labor/workBook.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { campFor } from "./deposit.ts";
import type { GatherKind } from "./kinds.ts";
import type { GatherObject } from "./objects.ts";
import { type ObjectRoll, objectRollOf } from "./objectYield.ts";
import { createPorters } from "./porter.ts";
import { type StationBuffs, cellDistance2, regrowMs, stationBuffs } from "./rules.ts";
import type { ObjectStore } from "./state.ts";
import type { HaulCarryHook } from "../logistics/haulService.ts";
import type { CarryResult, CarrySpec, HaulVia } from "./carrySpec.ts";

/** 채집소 하나(지금 상태) */
export interface StationSite {
  readonly buildingId: number;
  readonly facilityId: string;
  /** objects = 반경 안 오브젝트를 쓰는 채집소, facility = 건물 채집소(농장·목장·약초원, D-567)·맡는 오브젝트가 없는 채집 시설(창고·수확·피로 버프만, 756 ②) */
  readonly kind: "objects" | "facility";
  readonly level: number;
  readonly maxLevel: number;
  readonly slotsPerLevel: number;
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
  readonly ownerId: number | null;
  readonly cityId: number | null;
  /** 다 지었고 일하나(상태 문턱) */
  readonly works: boolean;
  /** 맡는 오브젝트 종류 차례(kinds 배열) */
  readonly kindIndexes: readonly number[];
  /** 지금 레벨 버프(facility 채집소는 수확·피로만 쓴다 — 반경·다시 자람은 오브젝트에만) */
  readonly buffs: StationBuffs;
}

/** 반경 안 오브젝트 하나와 그 지금 상태 */
export interface StationObject {
  readonly object: GatherObject;
  readonly usesLeft: number;
  readonly uses: number;
  readonly regrowAtMs: number;
}

export type StationWorkState = "working" | "no_objects" | "storage_full";

/** 일꾼 하나의 마지막 정산 결과(메모리) */
export interface StationWorkerStatus {
  readonly buildingId: number;
  readonly state: StationWorkState;
  readonly lots: number;
  readonly settledAtMs: number;
}

export interface StationDeps {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly now: () => number;
  readonly log: { error(obj: object, message: string): void };
  readonly kinds: () => readonly GatherKind[];
  readonly rules: () => SocietyCoefficients;
  readonly ledger: Ledger;
  readonly store: ObjectStore;
  places(): PlaceWorld | undefined;
  works(buildingId: number): boolean;
  /** 그 2차맵의 오브젝트(채집 서비스 objects — 지형에서 정한 자리) */
  objects(mapKey: number): readonly GatherObject[] | undefined;
  /** 2차맵(= 1차맵 칸)의 오염 값(0 ~ 100,000) */
  pollution(mapKey: number): number;
  /** 자동 옮김 타이머를 켜나(시험은 끄고 haulNow를 직접 부른다). 기본 true */
  readonly timers?: boolean | undefined;
  /** 그 채집소 일꾼(운반꾼 고르기, 질문 1090 가). 없으면 운반꾼이 없다 */
  readonly workersAt?:
    | ((buildingId: number) => readonly {
        unitId: number;
        workerOwnerId: number;
        via?: string;
        forOwnerId?: number | undefined;
      }[])
    | undefined;
  /**
   * 거래소 거래 직무 자리의 운반 시간 배율(질문 2084): 그 건물이 거래소면 거래 직무 유닛이 나를 때 걸리는 시간 ‰(설정 칸 exchange_desk_haul_pm),
   * 거래소가 아니면 undefined. 없으면 거래소 없음
   */
  readonly deskHaulPm?: ((buildingId: number) => number | undefined) | undefined;
  /** 다른 일(채집 줄 등)이 있는 유닛 — 운반꾼에서 뺀다 */
  readonly busy?: ((unitId: number) => boolean) | undefined;
  /** 받을 사람의 그 2차맵 유닛(일꾼 다음 운반꾼 후보, D-569 1784 — porter.ts). 없으면 일꾼만 */
  readonly ownUnits?: ((ownerId: number, mapKey: number) => readonly number[]) | undefined;
  /**
   * 자동 옮김의 주인 구매(기획 D-569 1781 — business/commands.ts sellTo): 채집소 주인이 제 사업장 창고 asset을 qty까지 판매가로 사고 산 수량을
   * 돌려준다(돈 → 사업장 금고, 매출). 없으면(시험) 예전처럼 값 없이 옮긴다
   */
  readonly ownerSale?:
    | ((ownerId: number, buildingId: number, asset: string, qty: bigint, atMs: number) => bigint)
    | undefined;
  /** 물류센터 운반 대행(기획 D-576 — logistics/haulService.ts). 없으면 맡기지 못한다(via 건물 ID = service_closed, auto = 내 운반꾼만) */
  readonly haulService?: HaulCarryHook | undefined;
}

/** 옮김 길의 출발 건물(채집소 또는 다른 시설 건물, D-569 1784) */
export interface HaulPlace {
  readonly buildingId: number;
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
  readonly ownerId: number | null;
  readonly cityId: number | null;
}

/** 채집소 하나의 옮김 길(질문 1050 가) */
export interface StationHaulRoute {
  /** 채집소 → 창고(없으면 도시 칸) 체비셰프 칸 */
  readonly cells: number;
  /** 창고 건물 ID(창고가 없어 도시 칸까지면 null) */
  readonly storeId: number | null;
  /** 나르는 사람 수 = 운반꾼 하나 [임시](질문 1090 가) */
  readonly carriers: number;
}

/** 나르는 중인 짐 하나 */
export interface StationTrip {
  readonly departAtMs: number;
  readonly arriveAtMs: number;
  readonly grams: bigint;
  /** 운반꾼 유닛 */
  readonly porter: number;
}

export interface StationRuntime {
  /** 노동 계약 서비스에 잇는 고리(labor.attachStation) */
  readonly hook: StationHook;
  site(buildingId: number): StationSite | undefined;
  /** 반경 안 오브젝트(가까운 차례, 같으면 작은 번호) */
  objectsIn(site: StationSite, nowMs: number): StationObject[];
  status(unitId: number): StationWorkerStatus | undefined;
  /** 다음 자동 옮김 시각(간격 0이면 null) */
  nextHaulAt(nowMs: number): number | null;
  /**
   * 닿은 짐을 도시 창고에 넣고(질문 1050 가), 나르는 중이 아닌 채집소의 주인 몫 물자를 싣고 떠난다(거리 0·옮김 셈 끔이면 바로 넣는다).
   * 바로 넣거나 닿아 넣은 계정 수
   */
  haulNow(nowMs: number): number;
  /** 채집소의 옮김 길(도시 밖이면 undefined) */
  haulRoute(buildingId: number): StationHaulRoute | undefined;
  /** 나르는 중인 짐(여럿이면 가장 늦게 닿는 것, 없으면 undefined) */
  trip(buildingId: number): StationTrip | undefined;
  /**
   * 손으로 옮기기(질문 1091 가, D-569 1784): 그 건물(채집소·창고 시설·사업장 등 시설 건물) 창고의 asset qty를 운반꾼에게 실어 ownerId의 그 도시 창고로
   * 보낸다. sellerId가 있으면 판매(business_buy) — 판 사람의 몫을 산 사람에게. 시설 건물이 아니거나 거리 셈이 없으면(옮김 셈 끔·거리 0) undefined
   * (부르는 쪽이 예전처럼 바로 옮긴다). null = 떠남, 아니면 결과 코드(운반꾼 없음 unknown_unit, 모두 바쁨 unit_busy 등)
   */
  haulOut(
    ownerId: number,
    buildingId: number,
    asset: string,
    qty: bigint,
    atMs: number,
    sellerId?: number,
    via?: HaulVia,
    keep?: CarrySpec["keep"],
  ): FacilityResultCode | null | undefined;
  /**
   * 거래소 넣기(기획 D-564 1628 "거래소로 실어 나른 물건만", docs/adr/2026-11-16-exchange-buildings.md): ownerId의 그 도시 창고 asset qty를 운반꾼(받을 사람의
   * 그 2차맵 유닛)이 도시 칸 → 물자 거래소 건물로 나른다. 옮김 셈 끔·거리 0이면 바로 넣는다. null = 떠남(또는 넣음), 아니면 결과 코드. 건물을 모르면 undefined
   */
  haulIn(
    ownerId: number,
    buildingId: number,
    asset: string,
    qty: bigint,
    atMs: number,
    via?: HaulVia,
  ): FacilityResultCode | null | undefined;
  /** 물류센터의 지금 나를 수 있는 일꾼 수(화면 — porter.ts freeStaff) */
  freeStaff(buildingId: number, mapKey: number, nowMs: number): number;
  /** 실제 운반 하나(CarrySpec — 거래소 넣기·배 상하역이 같이 쓴다) */
  carry(spec: CarrySpec): CarryResult;
  /** 그 원장 자리로 나르는 중인 짐 무게(g) — 배 싣기가 창고 상한에 미리 센다 */
  inbound(location: number): bigint;
  stop(): void;
}

export type { CarryResult, CarrySpec, HaulVia } from "./carrySpec.ts";

/** setTimeout 지연 상한 */
const MAX_TIMER_MS = 0x7fff_ffff;

/** 자산 이름 해시(수확 ‰ 나머지 굴림) */
function assetSalt(asset: string): number {
  let hash = 0x811c_9dc5;
  for (let i = 0; i < asset.length; i++) hash = Math.imul(hash ^ asset.charCodeAt(i), 0x0100_0193);
  return hash >>> 0;
}

/** 수량 × 배율(‰). 나머지는 (유닛, 묶음 차례, 자산) 굴림으로 하나를 더한다(기댓값 = 배율) */
export function scaleByPm(qty: bigint, yieldPm: number, unitId: number, seq: number, asset: string): bigint {
  if (qty <= 0n || yieldPm === 1000) return qty > 0n ? qty : 0n;
  const total = qty * BigInt(Math.max(0, yieldPm));
  let whole = total / 1000n;
  const rest = Number(total % 1000n);
  if (rest > 0) {
    const roll = mix32(Math.imul(unitId >>> 0, 0x9e37_79b1) ^ mix32((seq >>> 0) ^ assetSalt(asset))) >>> 0;
    if (roll % 1000 < rest) whole += 1n;
  }
  return whole;
}

/** 일한 주기의 피로에서 덜어 줄 몫(‰ 점): 막혀 하나도 못 끝냈으면 모두, 아니면 (1000 − 피로 배율) */
export function fatigueRefundPm(made: number, lots: number, blocked: boolean, fatiguePm: number): number {
  const cycles = Math.max(0, Math.floor(made));
  if (lots === 0 && blocked) return cycles * 1000;
  return cycles * Math.max(0, 1000 - Math.min(1000, Math.max(0, fatiguePm)));
}

export function createStationRuntime(deps: StationDeps): StationRuntime {
  const { maps, now, ledger, store } = deps;
  const statuses = new Map<number, StationWorkerStatus>();
  const totals = new Map<string, number>();
  /** 유닛 → 덜어 줄 피로 나머지(‰ 점) */
  const refunds = new Map<number, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const site = (buildingId: number): StationSite | undefined => {
    const world = deps.places();
    const record = world?.facilities.get(buildingId);
    const def = record && world ? world.catalog().facility(record.facilityId) : undefined;
    if (!world || !record || !def?.gather) return undefined;
    const cell = buildingCell(world.maps, buildingId);
    if (!cell) return undefined;
    // 건물 채집소(선택 방식, D-567)는 오브젝트를 맡지 않는다
    const kindIndexes: number[] = [];
    if (def.gather.mode !== "select")
      deps.kinds().forEach((kind, index) => {
        if (kind.facility === def.id) kindIndexes.push(index);
      });
    const level = Math.max(0, record.level);
    return {
      buildingId,
      facilityId: def.id,
      kind: kindIndexes.length > 0 ? "objects" : "facility",
      level,
      maxLevel: def.maxLevel,
      slotsPerLevel: def.slotsPerLevel,
      mapKey: cell.mapKey,
      x: cell.x,
      y: cell.y,
      ownerId: cell.ownerId,
      cityId: buildingPlace(world, buildingId)?.cityId ?? null,
      works: level >= 1 && deps.works(buildingId),
      kindIndexes,
      buffs: stationBuffs(deps.rules().gatherObjects, Math.max(1, level)),
    };
  };

  const objectsIn = (target: StationSite, nowMs: number): StationObject[] => {
    if (target.kind !== "objects") return [];
    const kinds = deps.kinds();
    const served = new Set(target.kindIndexes);
    const limit = target.buffs.radiusCells * target.buffs.radiusCells;
    const found: (StationObject & { readonly distance: number })[] = [];
    for (const object of deps.objects(target.mapKey) ?? []) {
      if (!served.has(object.kind)) continue;
      const distance = cellDistance2(object.x, object.y, target.x, target.y);
      if (distance > limit) continue;
      const uses = kinds[object.kind]?.uses ?? 1;
      const state = store.read(target.mapKey, object.id, uses, nowMs);
      found.push({ object, usesLeft: state.usesLeft, uses, regrowAtMs: state.regrowAtMs, distance });
    }
    return found
      .toSorted((a, b) => a.distance - b.distance || a.object.id - b.object.id)
      .map(({ distance: _distance, ...rest }) => rest);
  };

  /** 묶음 lots만큼 반경 안 오브젝트 번수를 쓴다(가까운 것부터). 쓴 번수 */
  const draw = (target: StationSite, list: readonly StationObject[], lots: number, atMs: number): number => {
    const world = deps.places();
    const kinds = deps.kinds();
    const rules = deps.rules().gatherObjects;
    let used = 0;
    for (const entry of list) {
      const kind = kinds[entry.object.kind];
      if (!kind) continue;
      while (used < lots) {
        const taken = store.take(target.mapKey, entry.object.id, kind.uses, atMs, () => {
          // 일하는 채집소 반경 안 오브젝트는 빨리 자란다(주인 상관없이 가장 가까운 채집소 레벨, 없으면 이 채집소)
          const camp = world
            ? campFor(world, target.mapKey, kind.facility, entry.object, rules, null, (id) => deps.works(id))
            : undefined;
          return regrowMs(kind, rules, deps.pollution(target.mapKey), camp?.level ?? target.level);
        });
        if (!taken) break;
        used += 1;
      }
      if (used >= lots) break;
    }
    return used;
  };

  const plan = (buildingId: number, unitId: number, room: bigint | null): StationPlan | undefined => {
    const target = site(buildingId);
    if (!target) return undefined;
    const at = now();
    const full = room !== null && room <= 0n;
    // facility 채집소(농장)는 오브젝트를 쓰지 않는다 — 묶음 상한은 창고가 가득일 때만(756 ②)
    const objects = target.kind === "objects";
    const list = full || !objects ? [] : objectsIn(target, at);
    let available = 0;
    for (const entry of list) available += Math.max(0, entry.usesLeft);
    const buffs = target.buffs;
    // k번째 묶음이 쓸 오브젝트(draw와 같은 차례 — 가까운 것부터 남은 번수만큼)의 규칙. 종류마다 한 번만 만든다
    const catalog = objects ? deps.places()?.catalog() : undefined;
    const kinds = deps.kinds();
    const rolls = new Map<number, ObjectRoll>();
    const lotRoll = (k: number): ObjectRoll | undefined => {
      if (!catalog) return undefined;
      let left = k;
      for (const entry of list) {
        const uses = Math.max(0, entry.usesLeft);
        if (left >= uses) {
          left -= uses;
          continue;
        }
        const kindIndex = entry.object.kind;
        const kind = kinds[kindIndex];
        if (!kind) return undefined;
        let roll = rolls.get(kindIndex);
        if (!roll) {
          roll = objectRollOf(kind, catalog);
          rolls.set(kindIndex, roll);
        }
        return roll;
      }
      return undefined;
    };
    return {
      maxLots: full ? 0 : objects ? available : undefined,
      ...(objects ? { lotRoll } : {}),
      scale: (asset, qty, seq) => scaleByPm(qty, buffs.yieldPm, unitId, seq, asset),
      commit(result) {
        const used = objects && result.lots > 0 ? draw(target, list, result.lots, at) : 0;
        if (objects && used < result.lots)
          deps.log.error({ buildingId, unitId, lots: result.lots, used }, "gather station drew fewer uses");
        const key = `${buildingId}:${unitId}`;
        const lots = (totals.get(key) ?? 0) + result.lots;
        totals.set(key, lots);
        const blocked = result.capped || result.clipped || full;
        statuses.set(unitId, {
          buildingId,
          state: full || result.clipped ? "storage_full" : result.capped ? "no_objects" : "working",
          lots,
          settledAtMs: at,
        });
        const refund = fatigueRefundPm(result.made, result.lots, blocked, buffs.fatiguePm);
        if (refund > 0) refunds.set(unitId, (refunds.get(unitId) ?? 0) + refund);
      },
    };
  };

  /** 정산 뒤: 그 주체 유닛의 덜어 줄 피로를 직무 상태에 적는다(나머지 ‰은 들고 간다) */
  const afterSettle = (ownerId: number): void => {
    for (const [unitId, carry] of refunds) {
      let done = false;
      for (const map of maps.values()) {
        const info = map.unitInfo(unitId);
        if (!info) continue;
        done = true;
        if (info.ownerId !== ownerId) break;
        const whole = Math.floor(carry / 1000);
        const rest = carry % 1000;
        if (whole > 0 && info.job.fatigue > 0)
          map.setJob(unitId, { ...info.job, fatigue: Math.max(0, info.job.fatigue - whole) });
        if (rest > 0) refunds.set(unitId, rest);
        else refunds.delete(unitId);
        break;
      }
      // 유닛이 사라졌으면 버린다
      if (!done) refunds.delete(unitId);
    }
  };

  const nextHaulAt = (nowMs: number): number | null => {
    const every = Math.max(0, Math.floor(deps.rules().gatherObjects.stationHaulMs));
    if (every <= 0) return null;
    return (Math.floor(nowMs / every) + 1) * every;
  };

  /** 건물 가운데 칸(배치 네모 가운데). 없으면 undefined */
  const centerOf = (mapKey: number, buildingId: number): { x: number; y: number } | undefined => {
    let found: { x: number; y: number } | undefined;
    maps.get(mapKey)?.forEachBuilding((building) => {
      if (building.id !== buildingId) return;
      const rect = footprintRect(building.placement);
      found = { x: rect.x + Math.floor(rect.width / 2), y: rect.y + Math.floor(rect.height / 2) };
    });
    return found;
  };

  /** 옮김 길의 출발 건물(채집소, D-569 1784부터는 시설 건물 모두): 2차맵·기준 칸·주인·도시 */
  const placeOf = (buildingId: number): HaulPlace | undefined => {
    const station = site(buildingId);
    if (station) return station;
    const world = deps.places();
    if (!world?.facilities.has(buildingId)) return undefined;
    const cell = buildingCell(world.maps, buildingId);
    if (!cell) return undefined;
    return { ...cell, buildingId, cityId: buildingPlace(world, buildingId)?.cityId ?? null };
  };

  /** 건물 → 받을 사람(없으면 건물 주인)의 가장 가까운 다른 창고(없으면 도시 칸)의 칸·두 끝 가운데 */
  const routeOf = (
    buildingId: number,
    receiverId?: number,
  ):
    | { cells: number; storeId: number | null; from: { x: number; y: number }; to: { x: number; y: number } }
    | undefined => {
    const world = deps.places();
    const target = placeOf(buildingId);
    if (!world || !target || target.cityId === null) return undefined;
    const storeOwner = receiverId ?? target.ownerId;
    const from = centerOf(target.mapKey, buildingId) ?? { x: target.x, y: target.y };
    const catalog = world.catalog();
    let best: { cells: number; storeId: number | null; to: { x: number; y: number } } | undefined;
    for (const record of world.facilities.values()) {
      if (record.buildingId === buildingId) continue;
      if (record.cityId !== target.cityId || record.level < 1 || !deps.works(record.buildingId)) continue;
      if (catalog.facility(record.facilityId)?.stage !== "storage") continue;
      const cell = buildingCell(maps, record.buildingId);
      if (!cell || cell.mapKey !== target.mapKey || cell.ownerId !== storeOwner) continue;
      const to = centerOf(cell.mapKey, record.buildingId) ?? cell;
      const cells = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
      if (!best || cells < best.cells || (cells === best.cells && record.buildingId < (best.storeId ?? 0)))
        best = { cells, storeId: record.buildingId, to: { x: to.x, y: to.y } };
    }
    if (!best) {
      const city = world.cities().find((entry) => entry.id === target.cityId);
      const to = city ? { x: city.x, y: city.y } : from;
      best = { cells: Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)), storeId: null, to };
    }
    return { ...best, from };
  };

  const haulRoute = (buildingId: number): StationHaulRoute | undefined => {
    const route = routeOf(buildingId);
    return route ? { cells: route.cells, storeId: route.storeId, carriers: 1 } : undefined;
  };

  /** 운반꾼과 나르는 중인 짐(질문 1090 가·1092 가) */
  const porters = createPorters({
    maps,
    ledger,
    log: deps.log,
    workersAt: (buildingId) => deps.workersAt?.(buildingId) ?? [],
    deskAt: (buildingId) => deps.deskHaulPm?.(buildingId) !== undefined,
    busy: deps.busy,
    ownUnits: deps.ownUnits,
  });

  /**
   * 걸리는 시간 배율(‰): 운영자 빠르기 표시(world/operatorPace.ts — 걸음처럼 그 배수로 준다, 사용자 지적 2026-11-12) × 거래 직무 유닛이 그 거래소
   * 반입·반출을 나르면 exchange_desk_haul_pm(질문 2084 — 창고를 맡은 일꾼이라 빨리 넣고 꺼낸다)
   */
  const haulTime = (ms: number, mapKey: number, buildingId: number, porter: number): number => {
    if (ms <= 0) return ms;
    const pace = maps.get(mapKey)?.paceOf(porter) ?? 1;
    const deskPm = deps.deskHaulPm?.(buildingId);
    const desk =
      deskPm !== undefined && (deps.workersAt?.(buildingId) ?? []).some((worker) => worker.unitId === porter);
    const scaled = desk ? Math.ceil((ms * Math.min(1000, Math.max(1, Math.trunc(deskPm)))) / 1000) : ms;
    return Math.ceil(scaled / pace);
  };

  /** 옮김 거래 하나(그때 남은 양까지만, 거리 0·옮김 셈 끔). 넣은 계정 수 */
  const postMoves = (
    moves: readonly { from: number; to: number; amount: bigint }[],
    atMs: number,
  ): number => {
    const entries: { account: number; amount: bigint }[] = [];
    let count = 0;
    for (const move of moves) {
      const have = ledger.balance(move.from);
      const qty = have < move.amount ? have : move.amount;
      if (qty <= 0n) continue;
      entries.push({ account: move.from, amount: -qty }, { account: move.to, amount: qty });
      count += 1;
    }
    if (entries.length > 0) ledger.post({ kind: "station_haul", atMs, entries });
    return count;
  };

  /** 운반꾼에게 실어 보낸다(거리 셈이 0이면 false — 부르는 쪽이 바로 옮긴다) */
  const sendWithPorter = (
    target: HaulPlace & { readonly cityId: number },
    ownerId: number,
    porter: number,
    loads: readonly { asset: string; qty: bigint; grams: bigint }[],
    atMs: number,
    resumed = false,
    sellerId?: number,
  ): boolean => {
    const route = routeOf(target.buildingId, ownerId);
    const rules = deps.rules();
    if (!route) return false;
    // 운영자 빠르기·거래 직무 배율(haulTime) [임시]
    const timeMs = (grams: bigint): number =>
      haulTime(haulMs(grams, route.cells, 1, rules), target.mapKey, target.buildingId, porter);
    let grams = 0n;
    for (const load of loads) grams += load.grams;
    if (timeMs(grams) <= 0) return false;
    porters.depart({
      buildingId: target.buildingId,
      ownerId,
      cityId: target.cityId,
      mapKey: target.mapKey,
      porter,
      stationLocation: buildingLocation(target.buildingId),
      loads,
      from: route.from,
      to: route.to,
      nowMs: atMs,
      timeMs,
      resumed,
      sourceOwnerId: sellerId,
    });
    return true;
  };

  const haulNow = (nowMs: number): number => {
    const world = deps.places();
    if (!world) return 0;
    // 닿은 짐부터 넣는다
    let accounts = porters.arriveDue(nowMs);
    // 도시에 선 채집소(objects·facility 모두, 756 ②)의 창고 위치 → 주인·도시. 나르는 중인 채집소는 건너뛴다
    const targets = new Map<number, StationSite & { readonly ownerId: number; readonly cityId: number }>();
    /** 운반꾼 후보 유닛 → 채집소(다시 켠 뒤 화물로 남은 짐 찾기) */
    const workerOf = new Map<number, number>();
    for (const record of world.facilities.values()) {
      if (porters.busyAt(record.buildingId)) continue;
      const target = site(record.buildingId);
      if (!target || target.ownerId === null || target.cityId === null) continue;
      targets.set(buildingLocation(target.buildingId), {
        ...target,
        ownerId: target.ownerId,
        cityId: target.cityId,
      });
      for (const worker of deps.workersAt?.(target.buildingId) ?? [])
        workerOf.set(worker.unitId, target.buildingId);
    }
    if (targets.size === 0) return accounts;
    const carried = new Set([...porters.trips.values()].map((trip) => trip.porter));
    const loads = new Map<
      number,
      { from: number; to: number; amount: bigint; asset: string; grams: bigint }[]
    >();
    /** 운반꾼 화물에 남은 짐(다시 켠 뒤): 유닛 → 줄 */
    const leftovers = new Map<number, { asset: string; qty: bigint; grams: bigint }[]>();
    const catalog = world.catalog();
    for (const account of ledger.accounts()) {
      if (account.location === null || account.balance <= 0n || !account.asset.startsWith("item:")) continue;
      if (account.location < 0) {
        // 화물(위치 = −유닛 ID): 그 채집소 주인 몫이고 나르는 중이 아니면 남은 짐
        const unitId = -account.location;
        const stationId = workerOf.get(unitId);
        const target = stationId === undefined ? undefined : targets.get(buildingLocation(stationId));
        if (!target || carried.has(unitId) || account.ownerId !== target.ownerId) continue;
        const list = leftovers.get(unitId) ?? [];
        list.push({
          asset: account.asset,
          qty: account.balance,
          grams: account.balance * assetWeightG(catalog, account.asset),
        });
        leftovers.set(unitId, list);
        continue;
      }
      const target = targets.get(account.location);
      if (!target || account.ownerId !== target.ownerId) continue;
      const list = loads.get(target.buildingId) ?? [];
      list.push({
        from: account.id,
        to: ledger.ownerAccount(target.ownerId, account.asset, cityLocation(target.cityId)),
        amount: account.balance,
        asset: account.asset,
        grams: account.balance * assetWeightG(catalog, account.asset),
      });
      loads.set(target.buildingId, list);
    }
    for (const [unitId, list] of [...leftovers].toSorted((a, b) => a[0] - b[0])) {
      const stationId = workerOf.get(unitId);
      const target = stationId === undefined ? undefined : targets.get(buildingLocation(stationId));
      if (!target || porters.busyAt(target.buildingId)) continue;
      if (!sendWithPorter(target, target.ownerId, unitId, list, nowMs, true)) {
        // 거리 셈이 없어졌으면 바로 넣는다
        const moves = list.map((line) => ({
          from: ledger.ownerAccount(target.ownerId, line.asset, cargoLocation(unitId)),
          to: ledger.ownerAccount(target.ownerId, line.asset, cityLocation(target.cityId)),
          amount: line.qty,
        }));
        accounts += postMoves(moves, nowMs);
      }
    }
    for (const [buildingId, found] of [...loads].toSorted((a, b) => a[0] - b[0])) {
      const target = targets.get(buildingLocation(buildingId));
      if (!target || porters.busyAt(buildingId)) continue;
      const route = routeOf(buildingId);
      let total = 0n;
      for (const move of found) total += move.grams;
      const instant = !route || haulMs(total, route.cells, 1, deps.rules()) <= 0;
      // 운반꾼이 없으면 채집소 창고에서 기다린다 [임시]
      const porter = instant ? undefined : porters.pick(buildingId, target.mapKey, target.ownerId, nowMs);
      if (!instant && porter === undefined) continue;
      // 주인 자동 구매(기획 D-569 1781 "주인이 꺼내는 기능은 존재하지 않는다 무조건 판매"): 고리가 있으면 판매가로 산 만큼만 옮긴다(매출로 잡힘)
      const sale = deps.ownerSale;
      const moves = sale
        ? found
            .map((move) => {
              const amount = sale(target.ownerId, buildingId, move.asset, move.amount, nowMs);
              const grams = move.amount > 0n ? (move.grams * amount) / move.amount : 0n;
              return { ...move, amount, grams };
            })
            .filter((move) => move.amount > 0n)
        : found;
      if (moves.length === 0) continue;
      if (instant || porter === undefined) {
        accounts += postMoves(moves, nowMs);
        continue;
      }
      const lines = moves.map((move) => ({ asset: move.asset, qty: move.amount, grams: move.grams }));
      sendWithPorter(target, target.ownerId, porter, lines, nowMs, false, sale ? target.ownerId : undefined);
    }
    return accounts;
  };

  const haulOut = (
    ownerId: number,
    buildingId: number,
    asset: string,
    qty: bigint,
    atMs: number,
    sellerId?: number,
    via?: HaulVia,
    keep?: CarrySpec["keep"],
  ): FacilityResultCode | null | undefined => {
    const world = deps.places();
    const target = placeOf(buildingId);
    if (!world || !target || target.cityId === null || !haulOn(deps.rules())) return undefined;
    const here = buildingLocation(buildingId);
    if (qty <= 0n || ledger.balanceOf(sellerId ?? ownerId, asset, here) < qty)
      return "insufficient_materials";
    const grams = qty * assetWeightG(world.catalog(), asset);
    const route = routeOf(buildingId, ownerId);
    if (!route || haulMs(grams, route.cells, 1, deps.rules()) <= 0) return undefined;
    // 같은 운반 한 길(carry — 내 운반꾼·고른 물류센터·자동 맡기기, 기획 대조 2273)
    const carried = carry({
      ownerId,
      buildingId,
      mapKey: target.mapKey,
      cityId: target.cityId,
      source: here,
      deliverTo: cityLocation(target.cityId),
      from: route.from,
      to: route.to,
      loads: [{ asset, qty }],
      atMs,
      instantKind: "storage_out",
      via,
      sellerId,
      keep,
    });
    return typeof carried === "string" ? carried : null;
  };

  /**
   * 실제 운반(기획 D-555 1505 "어떤 유닛이든 실제로 옮겨야"): 거래소 넣기·배 상하역(boats/cargo.ts)이 같이 쓴다. 운반꾼 = 그 건물 일꾼 → 물건 주인의
   * 그 2차맵 유닛(porters.pick — 거래소 거래 직무 자리면 나를 위해 일하는 유닛만), 걸리는 시간 = haulMs(전체 무게, from → to 체비셰프 칸, 운반꾼
   * 하나) × haulTime(운반꾼 빠르기, 거래 직무 배율). 옮김 셈 끔·거리 0이면 바로 옮긴다
   */
  const carry = (spec: CarrySpec): CarryResult => {
    const world = deps.places();
    const catalog = world?.catalog();
    const loads = spec.loads
      .filter((load) => load.qty > 0n)
      .map((load) => ({
        asset: load.asset,
        qty: load.qty,
        grams: catalog ? load.qty * assetWeightG(catalog, load.asset) : 0n,
      }));
    const grams = loads.reduce((sum, load) => sum + load.grams, 0n);
    const cells = Math.max(Math.abs(spec.to.x - spec.from.x), Math.abs(spec.to.y - spec.from.y));
    const rules = deps.rules();
    if (!haulOn(rules) || haulMs(grams, cells, 1, rules) <= 0) {
      const entries: { account: number; amount: bigint }[] = [];
      for (const load of loads)
        entries.push(
          { account: ledger.ownerAccount(spec.ownerId, load.asset, spec.source), amount: -load.qty },
          { account: ledger.ownerAccount(spec.ownerId, load.asset, spec.deliverTo), amount: load.qty },
        );
      if (entries.length > 0) ledger.post({ kind: spec.instantKind, atMs: spec.atMs, entries });
      return { arriveAtMs: spec.atMs };
    }
    const service = deps.haulService;
    // via가 없으면 계정 자동 맡기기(기획 대조 2272), own = 내 운반꾼만
    const via =
      spec.via === "own" ? undefined : (spec.via ?? (service?.auto(spec.ownerId) ? "auto" : undefined));
    // 물류센터를 고른 명령(D-576)은 그 물류센터 일꾼만 — 내 운반꾼으로 넘어가지 않는다
    if (typeof via === "number")
      return service
        ? (viaCenter(spec, via, service, loads, grams, cells, true) ?? "no_shop_worker")
        : "service_closed";
    const porter = porters.pick(spec.buildingId, spec.mapKey, spec.ownerId, spec.atMs);
    if (porter === undefined) {
      // 자동 맡기기(계정 설정, D-576): 내 운반꾼이 없으면 같은 도시의 받는 물류센터(싼 차례)
      const auto =
        via === "auto" && service ? viaCenter(spec, via, service, loads, grams, cells, false) : undefined;
      if (auto !== undefined) return auto;
      const map = maps.get(spec.mapKey);
      // 거래소 거래 직무 자리(질문 2084)는 나를 위해 일하는 유닛만 후보다(porter.ts pick과 같은 걸러내기)
      const desk = deps.deskHaulPm?.(spec.buildingId) !== undefined;
      const candidates = [
        ...(deps.workersAt?.(spec.buildingId) ?? [])
          .filter((worker) => !desk || (worker.forOwnerId ?? worker.workerOwnerId) === spec.ownerId)
          .map((worker) => worker.unitId),
        ...(deps.ownUnits?.(spec.ownerId, spec.mapKey) ?? []),
      ];
      return candidates.some((unitId) => map?.unitInfo(unitId) !== undefined) ? "unit_busy" : "unknown_unit";
    }
    return departCarry(spec, spec.buildingId, porter, loads, cells);
  };

  /** 짐 하나를 떠나보낸다(buildingId = 운반꾼을 고른 건물 — 물류센터에 맡겼으면 그 물류센터) */
  const departCarry = (
    spec: CarrySpec,
    buildingId: number,
    porter: number,
    loads: readonly { asset: string; qty: bigint; grams: bigint }[],
    cells: number,
  ): CarryResult => {
    const trip = porters.depart({
      buildingId,
      ownerId: spec.ownerId,
      cityId: spec.cityId,
      mapKey: spec.mapKey,
      porter,
      stationLocation: spec.source,
      loads,
      from: spec.from,
      to: spec.to,
      nowMs: spec.atMs,
      // 운영자 빠르기·거래 직무 배율(haulTime — 거래소 넣기에서 거래 직무 유닛이 나르면 exchange_desk_haul_pm배, 질문 2084)
      timeMs: (total) => haulTime(haulMs(total, cells, 1, deps.rules()), spec.mapKey, buildingId, porter),
      deliverTo: spec.deliverTo,
      redirect: spec.redirect,
      sourceOwnerId: spec.sellerId,
    });
    rearm();
    return { arriveAtMs: trip.arriveAtMs, porter };
  };

  /**
   * 물류센터에 맡긴다(기획 D-576, logistics/haulService.ts): 후보(고른 곳 하나 또는 싼 차례) 가운데 나를 일꾼이 있는 첫 곳의 일꾼이 지고, 떠날 때 요금을 낸다.
   * strict = 명령이 고른 곳(받지 않으면 그 코드). 맡기지 못하면 undefined(고른 곳이면 부르는 쪽이 no_shop_worker)
   */
  const viaCenter = (
    spec: CarrySpec,
    via: number | "auto",
    service: HaulCarryHook,
    loads: readonly { asset: string; qty: bigint; grams: bigint }[],
    grams: bigint,
    cells: number,
    strict: boolean,
  ): CarryResult | undefined => {
    const candidates = service.centers(via, spec);
    if (typeof candidates === "string") return strict ? candidates : undefined;
    for (const centerId of candidates) {
      const porter = porters.pick(centerId, spec.mapKey, spec.ownerId, spec.atMs, true);
      if (porter === undefined) continue;
      const fee = service.fee(centerId, grams, cells);
      const paid = service.pay(spec.ownerId, centerId, fee, spec.atMs, spec.keep);
      if (paid !== null) return paid;
      return departCarry(spec, centerId, porter, loads, cells);
    }
    return undefined;
  };

  const inbound = (location: number): bigint => {
    let grams = 0n;
    for (const trip of porters.trips.values()) if (trip.deliverTo === location) grams += trip.grams;
    return grams;
  };

  const haulIn = (
    ownerId: number,
    buildingId: number,
    asset: string,
    qty: bigint,
    atMs: number,
    via?: HaulVia,
  ): FacilityResultCode | null | undefined => {
    const world = deps.places();
    const target = placeOf(buildingId);
    if (!world || !target) return undefined;
    if (target.cityId === null) return "no_place";
    // 거래소에는 물자만 올린다(화폐·지분은 자리 없는 지갑)
    if (!asset.startsWith("item:")) return "not_storage";
    const cityId = target.cityId;
    const source = cityLocation(cityId);
    if (qty <= 0n || ledger.balanceOf(ownerId, asset, source) < qty) return "insufficient_materials";
    const city = world.cities().find((entry) => entry.id === cityId);
    const carried = carry({
      ownerId,
      buildingId,
      mapKey: target.mapKey,
      cityId,
      source,
      deliverTo: buildingLocation(buildingId),
      from: city ? { x: city.x, y: city.y } : { x: target.x, y: target.y },
      to: centerOf(target.mapKey, buildingId) ?? { x: target.x, y: target.y },
      loads: [{ asset, qty }],
      atMs,
      instantKind: "exchange_deposit",
      via,
    });
    return typeof carried === "string" ? carried : null;
  };

  const haulEvery = (): number => Math.max(0, Math.floor(deps.rules().gatherObjects.stationHaulMs));
  /** 마지막으로 싣고 떠난 정시 차례(타이머가 정시 사이에 깨어나도 다시 떠나지 않게) */
  let lastBoundary = -1;

  /** 다음에 깨어날 시각: 다음 정시와 운반꾼 걸음·가장 이른 닿는 시각 가운데 이른 것 */
  const nextWakeAt = (nowMs: number): number => {
    const next = nextHaulAt(nowMs) ?? nowMs + 60_000;
    const porter = porters.nextWakeAt(nowMs);
    return porter !== undefined && porter < next ? porter : next;
  };

  const arm = (): void => {
    if (stopped || deps.timers === false) return;
    const at = now();
    const next = nextWakeAt(at);
    timer = setTimeout(
      () => {
        timer = undefined;
        try {
          const t = now();
          // 정시가 지났으면 싣고 떠나기까지, 아니면 닿은 짐·운반꾼 걸음만
          if (nextHaulAt(t - 1) !== null && Math.floor(t / Math.max(1, haulEvery())) !== lastBoundary) {
            lastBoundary = Math.floor(t / Math.max(1, haulEvery()));
            haulNow(t);
          } else porters.arriveDue(t);
          porters.step(t);
        } catch (error) {
          deps.log.error({ err: error }, "gather station haul failed");
        }
        arm();
      },
      Math.min(MAX_TIMER_MS, Math.max(1000, next - at)),
    );
    timer.unref();
  };
  /** 새 짐이 떠났으면 타이머를 다시 맞춘다(운반꾼 걸음·닿는 시각) */
  const rearm = (): void => {
    if (stopped || deps.timers === false) return;
    if (timer) clearTimeout(timer);
    timer = undefined;
    arm();
  };
  arm();

  return {
    hook: { plan, afterSettle },
    site,
    objectsIn,
    status: (unitId) => statuses.get(unitId),
    nextHaulAt,
    haulNow,
    haulRoute,
    trip: (buildingId) => {
      const found = porters.latestAt(buildingId);
      return found
        ? {
            departAtMs: found.departAtMs,
            arriveAtMs: found.arriveAtMs,
            grams: found.grams,
            porter: found.porter,
          }
        : undefined;
    },
    haulOut,
    haulIn,
    carry,
    inbound,
    freeStaff: (buildingId, mapKey, nowMs) => porters.freeStaff(buildingId, mapKey, nowMs),
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}

/** 유닛이 쉬는 중인가(직무 쉼 단계) */
export const resting = (phase: number): boolean => phase === PHASE_REST;
