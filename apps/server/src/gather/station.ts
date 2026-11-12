// 채집소(벌목장·광산) — 사용자 지적(2026-11-08) "원자재채집소의 기능도 필요", 사용자 답 D-519(원문은 docs/adr/2026-11-07-gather-objects.md 배경)
// "오브젝트가 몰린곳에 광산이나 벌목소를 통해 빠르게 저장하고 버프(피로도 소모감소, 건물 등급에 따른 채집량 등, 오브젝트 빠른 재생 등) 임금 등의
// 시스템도 활용 가능". ADR "바뀜 (2026-11-08 사용자 지적: 채집소 기능)".
// - 채집소 = 팩 gather가 있는 시설. 원자재 오브젝트 종류가 맡는 시설(gather_objects facility — 벌목장·광산)은 "objects" 채집소, 맡는 오브젝트가
//   없는 채집 시설(농장 — 뒤에 목장 등)은 "facility" 채집소다. 기획 정리 756 ②(D-523 포인터, "농장도 창고·버프"): facility 채집소도 채집소 창고·
//   수확·피로 버프·자동 옮김을 받는다. 오브젝트가 없으니 반경·다시 자람 버프와 "반경 안 오브젝트가 있어야 낸다"는 규칙은 없고, 산출 규칙(선택 모드
//   D-507 등)은 그대로다.
// - 1차 생산 여섯 가지가 모두 땅에 묶인 자리를 맡는다(docs/adr/2026-11-11-city-catchment.md): 팩 core@66부터 농장·목장·낚시터도 밭·목초지·
//   물터(gather_objects source plot)를 맡아 "objects" 채집소다 — 반경 안 자리 번수가 일꾼 묶음 상한이다(다른 채집소·다른 도시와 같은 칸을
//   다툰다). "facility" 채집소는 맡는 오브젝트 종류가 없는 채집 시설(지금 팩에는 없다 — 덮어쓰기·시험 팩)에 남는다.
// - 일꾼(직무 배치·노동 계약, 같은 2차맵 522 ①)은 소유 주체 정산(labor/workBook.ts goodsFor → 이 고리)에서 묶음마다 반경 안 오브젝트 번수를
//   하나씩 쓴다(objects 채집소만, 가까운 것부터, 질문 664 ②). 남은 번수가 없으면 그 묶음을 끝내지 못하고 진행은 묶음 하나 몫까지만 쌓인다. 레벨
//   수확 버프를 곱하고(‰ 나머지는 결정적 굴림), 산출은 채집소 창고(그 건물 창고, 상한 = 팩 storageKg × 레벨)로 간다. 창고가 가득이면 묶음을
//   끝내지 않는다(두 종류 모두).
// - 피로 덜기: 일한 주기 피로(주기마다 1점, @terra/sim 직무 규칙)에서 (1000 − 레벨 피로 배율)‰을 정산 뒤에 덜어 준다. 오브젝트·창고에 막혀 묶음을
//   하나도 못 끝낸 구간은 기다림이라 피로를 모두 덜어 준다. 나머지 ‰은 메모리에 들고 다음 정산에 더한다.
// - 자동 옮김: 설정 칸 간격(gather_obj_station_haul_ms)의 정시마다 채집소 창고의 주인 몫 물자를 그 도시의 주인 도시 창고로 옮긴다(거래 하나,
//   kind station_haul). 임대형 임차인 몫은 그대로(유예 규칙). 손으로는 이미 있는 창고 꺼내기(storage_move out)로 옮긴다.
// - 옮김 거리(질문 1050 가, D-533 "창고와 원자재채집소와의 관계", 기획 43 §7.1 직접 운반·§7.3)와 운반꾼(질문 1090 가·1092 가·1091 가, D-534):
//   거리가 있으면 보이는 운반꾼(그 채집소 일꾼 하나, porter.ts)이 정시에 주인 몫을 화물로 싣고 걸어 나른다 — 물건은 채집소 창고에서 운반꾼 화물로
//   옮겨 채집소 창고 자리가 바로 빈다. 걸리는 시간은 옛 셈(@terra/sim haulMs — 무게 ÷ 화물 상한 gather_obj_carry_g 횟수 × 왕복 2 × 칸 × 걷기 ms,
//   나르는 사람 = 운반꾼 하나 [임시]) 그대로, 닿는 시각에 화물에 남은 만큼 도시 창고에 넣는다. 칸 = 채집소 가운데 → 그 도시에 선 주인의 가장 가까운
//   창고(창고 단계, 일하는 것) 가운데, 창고가 없으면 도시 칸(체비셰프). 나르는 동안 그 채집소는 다음 정시를 건너뛴다. 운반꾼으로 쓸 일꾼이 없으면
//   물건은 채집소 창고에서 기다린다 [임시]. 손으로 옮기기(창고 꺼내기 storage_move out, haulOut)도 같은 운반꾼·시간이다. 옮김 셈을 끄면
//   (haul_distance_mode 0) 또는 거리 0이면 예전처럼 바로.
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
import { createPorters } from "./porter.ts";
import { type StationBuffs, cellDistance2, regrowMs, stationBuffs } from "./rules.ts";
import type { ObjectStore } from "./state.ts";

/** 채집소 하나(지금 상태) */
export interface StationSite {
  readonly buildingId: number;
  readonly facilityId: string;
  /** objects = 반경 안 오브젝트를 쓰는 채집소, facility = 맡는 오브젝트가 없는 채집 시설(농장 등 — 창고·수확·피로 버프만, 756 ②) */
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
    | ((buildingId: number) => readonly { unitId: number; workerOwnerId: number }[])
    | undefined;
  /** 다른 일(채집 줄 등)이 있는 유닛 — 운반꾼에서 뺀다 */
  readonly busy?: ((unitId: number) => boolean) | undefined;
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
   * 손으로 옮기기(질문 1091 가): 채집소 창고의 내 몫 asset qty를 운반꾼에게 실어 보낸다. 채집소가 아니거나 거리 셈이 없으면(옮김 셈 끔·거리 0)
   * undefined(부르는 쪽이 예전처럼 바로 옮긴다). null = 떠남, 아니면 결과 코드(운반꾼 없음 unknown_unit, 모두 바쁨 unit_busy 등)
   */
  haulOut(
    ownerId: number,
    buildingId: number,
    asset: string,
    qty: bigint,
    atMs: number,
  ): FacilityResultCode | null | undefined;
  stop(): void;
}

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
    const kindIndexes: number[] = [];
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
    return {
      maxLots: full ? 0 : objects ? available : undefined,
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

  /** 채집소 → 창고(없으면 도시 칸)의 칸·두 끝 가운데 */
  const routeOf = (
    buildingId: number,
  ):
    | { cells: number; storeId: number | null; from: { x: number; y: number }; to: { x: number; y: number } }
    | undefined => {
    const world = deps.places();
    const target = site(buildingId);
    if (!world || !target || target.cityId === null) return undefined;
    const from = centerOf(target.mapKey, buildingId) ?? { x: target.x, y: target.y };
    const catalog = world.catalog();
    let best: { cells: number; storeId: number | null; to: { x: number; y: number } } | undefined;
    for (const record of world.facilities.values()) {
      if (record.cityId !== target.cityId || record.level < 1 || !deps.works(record.buildingId)) continue;
      if (catalog.facility(record.facilityId)?.stage !== "storage") continue;
      const cell = buildingCell(maps, record.buildingId);
      if (!cell || cell.mapKey !== target.mapKey || cell.ownerId !== target.ownerId) continue;
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
    busy: deps.busy,
  });

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
    target: StationSite & { readonly cityId: number },
    ownerId: number,
    porter: number,
    loads: readonly { asset: string; qty: bigint; grams: bigint }[],
    atMs: number,
    resumed = false,
  ): boolean => {
    const route = routeOf(target.buildingId);
    const rules = deps.rules();
    if (!route) return false;
    // 운영자 빠르기 표시(world/operatorPace.ts)가 달린 운반꾼은 걸음처럼 나르는 시간도 그 배수로 준다(사용자 지적 2026-11-12) [임시]
    const pace = maps.get(target.mapKey)?.paceOf(porter) ?? 1;
    const timeMs = (grams: bigint): number => {
      const ms = haulMs(grams, route.cells, 1, rules);
      return ms <= 0 ? ms : Math.ceil(ms / pace);
    };
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
    for (const [buildingId, moves] of [...loads].toSorted((a, b) => a[0] - b[0])) {
      const target = targets.get(buildingLocation(buildingId));
      if (!target || porters.busyAt(buildingId)) continue;
      const lines = moves.map((move) => ({ asset: move.asset, qty: move.amount, grams: move.grams }));
      const route = routeOf(buildingId);
      let grams = 0n;
      for (const line of lines) grams += line.grams;
      if (!route || haulMs(grams, route.cells, 1, deps.rules()) <= 0) {
        accounts += postMoves(moves, nowMs);
        continue;
      }
      // 운반꾼이 없으면 채집소 창고에서 기다린다 [임시]
      const porter = porters.pick(buildingId, target.mapKey, target.ownerId, nowMs);
      if (porter !== undefined) sendWithPorter(target, target.ownerId, porter, lines, nowMs);
    }
    return accounts;
  };

  const haulOut = (
    ownerId: number,
    buildingId: number,
    asset: string,
    qty: bigint,
    atMs: number,
  ): FacilityResultCode | null | undefined => {
    const world = deps.places();
    const target = site(buildingId);
    if (!world || !target || target.cityId === null || !haulOn(deps.rules())) return undefined;
    const here = buildingLocation(buildingId);
    if (qty <= 0n || ledger.balanceOf(ownerId, asset, here) < qty) return "insufficient_materials";
    const grams = qty * assetWeightG(world.catalog(), asset);
    const route = routeOf(buildingId);
    if (!route || haulMs(grams, route.cells, 1, deps.rules()) <= 0) return undefined;
    const porter = porters.pick(buildingId, target.mapKey, ownerId, atMs);
    if (porter === undefined) {
      const any = (deps.workersAt?.(buildingId) ?? []).some(
        (worker) => maps.get(target.mapKey)?.unitInfo(worker.unitId) !== undefined,
      );
      return any ? "unit_busy" : "unknown_unit";
    }
    sendWithPorter({ ...target, cityId: target.cityId }, ownerId, porter, [{ asset, qty, grams }], atMs);
    rearm();
    return null;
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
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}

/** 유닛이 쉬는 중인가(직무 쉼 단계) */
export const resting = (phase: number): boolean => phase === PHASE_REST;
