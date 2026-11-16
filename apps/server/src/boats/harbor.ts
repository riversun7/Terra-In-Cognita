// 배 상태·정박장·교역 부두 — 기획 D-547(1485~1500)·D-548, docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (2026-11-15)".
// - 배 상태(종류·내구도·집 정박장): 배가 뜰 때 만든다. 상태가 없는 배(시험 배 등)는 처음 볼 때 그 세계 처음 배 종류·가득으로 만든다.
// - 내구도: 정시 살피기(HARBOR_TICK_MS)마다 지금 처지(정박 중·밖·집 없음·수리 중 — rules.ts)로 지난 시간만큼 닳는다. ‰가 바뀔 때만 적는다.
// - 집 정박장(1485·1487·1490): 빈 정박 자리가 있고 받기 범위가 맞으면 자리를 잡는다. 만들기와 상관없다(정박 자리 없이도 만든다).
//   정박장이 없어지거나 폐허(상태 0)가 되면 집을 잃는다(1500 가 — 기준 아래는 새로 받지 않을 뿐 이미 든 배는 그대로).
// - 정박료(1491·D-548): 남의 정박장에 든 배는 하루마다 그 정박장 금고(주인 계정 · 건물 위치 — 사업장 장부 ADR 결정 1)에 낸다. 모자라면 있는 만큼 내고
//   못 낸 날을 센다. arrearsDays가 차면 집을 잃는다(배는 잃지 않는다). 받기 범위를 좁히면 맞지 않는 남의 배는 다음 살피기에 집을 잃는다.
// - 교역 부두(1488·1489): 시간을 사면 바로 그 부두 금고에 낸다. 산 시간을 넘겨 부두 둘레에 있으면 초과 한 시간마다 한 시간 요금 × tradeOverstayMul을 낸다
//   (있는 만큼). 산 시간이 지나고 부두를 떠났으면 머묾이 끝난다.
// - 내 배(같은 주인)는 내 시설에서 요금이 없다. 주인 없는 시설은 요금을 받지 않는다.
// D-559(docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (2026-11-15) D-559"):
// - 요금 화폐 = 그 시설이 선 나라 화폐(1524, deps.feeAssetOf — 모르면 서버 시험 화폐).
// - 도크에 든 배(yardId)는 2차맵 유닛이 없다(처지 docked — 닳지 않는다, 정시 살피기는 dock.ts가 본다).
// - 연료·오버히트·갑판병 수리(1529·1533·1540): 정시 살피기마다 지난 구간에 움직인 시간으로 연료를 쓰고(오버히트면 더), 오버히트 닳음·갑판병 수리를 더한다.
import { buildingLocation } from "@terra/shared/goodsPlaces";
import {
  DEFAULT_HARBOR_ACCESS,
  type HarborAccess,
  HULL_FULL,
  NPC_HARBOR_ACCESS,
  type ShipyardModule,
} from "@terra/shared/harbor";
import type { BoatTypeDef } from "../facilities/catalog.ts";
import { arrivalAt } from "@terra/sim";
import { UNIT_KIND_BOAT } from "../world/unitKinds.ts";
import {
  type BoatDeps,
  type FoundBuilding,
  bodyRect,
  facilityOf,
  findBuilding,
  mapOfUnit,
  rectGap,
} from "./core.ts";
import {
  type BoatMode,
  DAY_MS,
  HOUR_MS,
  boatTypesOf,
  deckRepairPpm,
  dueDays,
  fuelBurnMilli,
  fuelTankMilli,
  harborOpen,
  isBerth,
  isShipyard,
  isTradeDock,
  overheatWearPpm,
  overlapMs,
  wornHull,
} from "./rules.ts";
import { type BoatFacility, type BoatState, type BoatStore, FRESH_BOAT_FIELDS } from "./store.ts";

/** 정시 살피기 간격(ms) [임시] */
export const HARBOR_TICK_MS = 60_000;

/** 한 번 살핀 결과(지표·시험) */
export interface HarborTick {
  readonly boats: number;
  readonly saved: number;
  readonly evicted: number;
  /** 낸 정박료·교역 부두 요금 합(화폐 최소 단위) */
  readonly fees: bigint;
}

export interface Harbor {
  readonly states: ReadonlyMap<number, BoatState>;
  /** 배 상태(없으면 처음 볼 때 만든다 — 배가 띄운 2차맵에 있을 때만) */
  stateOf(boatId: number): BoatState | undefined;
  /** 새 배의 상태를 만든다(조선소가 띄우거나 도크에 넣을 때 — extra로 도크 칸을 함께) */
  create(boatId: number, typeId: string, nowMs: number, extra?: Partial<BoatState>): BoatState;
  /** 그 조선소 도크에 든 배(배 ID 차례) */
  dockedAt(buildingId: number): BoatState[];
  /** 연료가 바닥났나(표류) */
  fuelEmpty(state: BoatState): boolean;
  /** 지금 연료(천분의 단위)·연료 통 */
  fuelOf(state: BoatState): { readonly milli: number; readonly tank: number };
  /** 그 시설의 요금 화폐 */
  assetAt(buildingId: number): string | undefined;
  /** 지금 내구도(ppm) */
  hullOf(state: BoatState, nowMs: number): number;
  /** 지금 처지 */
  modeOf(state: BoatState, nowMs: number): BoatMode;
  /** 지난 구간을 모두 셈한다(닳음 + 연료·오버히트·갑판병 — 오버히트·보급 바꾸기 직전) */
  account(state: BoatState, nowMs: number): void;
  /** 지금 처지로 닳음을 들이고 시각을 옮긴다(처지가 바뀌기 직전에 부른다). 적었으면 true */
  settle(state: BoatState, nowMs: number, force?: boolean): boolean;
  /** 배 종류 정의(모르면 undefined) */
  typeOf(state: BoatState | undefined): BoatTypeDef | undefined;
  /** 시설 주인 설정(줄이 없으면 처음 값) */
  facility(buildingId: number, ownerId: number | null): BoatFacility;
  saveFacility(row: BoatFacility): void;
  /** 그 주인의 배가 그 시설(주인 facilityOwner)을 쓸 수 있나(받기 범위) */
  admits(buildingId: number, facilityOwner: number | null, boatOwner: number): Promise<boolean>;
  /** 그 정박장을 집으로 둔 배 / 그 교역 부두에 머무는 배 */
  homedAt(buildingId: number): BoatState[];
  visitingAt(buildingId: number, nowMs: number): BoatState[];
  /** 배가 그 건물 둘레 reach 칸 안에 있나 */
  near(boatId: number, found: FoundBuilding, reach: number, nowMs: number): boolean;
  /** 요금을 낸다(배 주인 지갑 → 시설 금고). 낸 양 */
  charge(
    boatOwner: number,
    facilityOwner: number | null,
    buildingId: number,
    amount: bigint,
    kind: string,
    atMs: number,
  ): bigint;
  /** 배 주인 지갑 잔고(그 시설의 요금 화폐) */
  balanceOf(ownerId: number, buildingId: number): bigint;
  /** 시설 금고 잔고(사업장 장부, D-548) */
  cashOf(facilityOwner: number | null, buildingId: number): bigint;
  saveState(state: BoatState): void;
  remove(boatId: number): void;
  tick(nowMs: number): Promise<HarborTick>;
}

/** 배가 그 건물 둘레 reach 칸 안에 있나 */
const near = (boatId: number, found: FoundBuilding, reach: number, nowMs: number): boolean => {
  const rect = bodyRect(found.map, boatId, nowMs);
  return rect !== undefined && rectGap(rect, found.rect) <= reach;
};

/** 연료가 바닥났나(표류, D-559 1529 — null = 가득인 옛 배) */
const fuelEmpty = (state: BoatState): boolean => state.fuelMilli !== null && state.fuelMilli <= 0;

/** 집을 잃는다(배는 잃지 않는다) */
const evict = (state: BoatState): void => {
  state.homeId = null;
  state.feePaidToMs = null;
  state.arrears = 0;
};

export function createHarbor(
  deps: BoatDeps,
  store: BoatStore,
  repairing: (boatId: number) => boolean,
): Harbor {
  const { maps } = deps;
  const states = new Map<number, BoatState>();
  const settings = new Map<number, BoatFacility>();
  for (const state of deps.states ?? []) states.set(state.boatId, { ...state });
  for (const row of deps.facilityRows ?? []) settings.set(row.buildingId, { ...row });

  const types = (): ReadonlyMap<string, BoatTypeDef> => {
    const catalog = deps.places()?.catalog();
    return catalog ? boatTypesOf(catalog) : new Map();
  };

  const modeOf = (state: BoatState, nowMs: number): BoatMode => {
    if (repairing(state.boatId)) return "repair";
    if (state.yardId !== null) return "docked";
    if (state.homeId === null) return "homeless";
    const home = findBuilding(maps, state.homeId);
    if (!home || home.map.unitInfo(state.boatId) === undefined) return "away";
    return near(state.boatId, home, deps.rules().harborReachCells, nowMs) ? "berthed" : "away";
  };

  const hullOf = (state: BoatState, nowMs: number): number =>
    wornHull(state.hullPpm, state.hullAtMs, nowMs, modeOf(state, nowMs), deps.rules());

  const saveState = (state: BoatState): void => store.saveState(state);

  const settle = (state: BoatState, nowMs: number, force = false): boolean => {
    const next = hullOf(state, nowMs);
    const changed = Math.floor(next / 1000) !== Math.floor(state.hullPpm / 1000);
    state.hullPpm = next;
    state.hullAtMs = Math.max(state.hullAtMs, nowMs);
    if (changed || force) saveState(state);
    return changed || force;
  };

  const create = (
    boatId: number,
    typeId: string,
    nowMs: number,
    extra: Partial<BoatState> = {},
  ): BoatState => {
    const state: BoatState = {
      boatId,
      typeId,
      hullPpm: HULL_FULL,
      hullAtMs: nowMs,
      homeId: null,
      feePaidToMs: null,
      arrears: 0,
      tradeId: null,
      tradeUntilMs: null,
      tradeChargedToMs: null,
      ...FRESH_BOAT_FIELDS,
      crew: {},
      gear: [],
      ...extra,
    };
    states.set(boatId, state);
    saveState(state);
    return state;
  };

  const stateOf = (boatId: number): BoatState | undefined => {
    const found = states.get(boatId);
    if (found) return found;
    // 상태가 없는 배(시험 배·옛 판에서 남은 배): 처음 볼 때 그 세계 처음 배 종류·가득으로
    const map = mapOfUnit(maps, boatId);
    if (map?.unitInfo(boatId)?.kind !== UNIT_KIND_BOAT) return undefined;
    const first = types().keys().next();
    return create(boatId, first.done ? "rowboat" : first.value, deps.now());
  };

  const facility = (buildingId: number, ownerId: number | null): BoatFacility => {
    const found = settings.get(buildingId);
    if (found) return found;
    const rules = deps.rules();
    const def = facilityOf(deps.places(), buildingId)?.def;
    const npc = ownerId !== null && deps.isNpc?.(ownerId) === true;
    return {
      buildingId,
      access: npc ? NPC_HARBOR_ACCESS : DEFAULT_HARBOR_ACCESS,
      fee: isTradeDock(def)
        ? rules.tradeFeePerHour
        : isShipyard(def)
          ? rules.shipyardRepairFee
          : rules.berthFeePerDay,
      module: null,
      modules: [],
    };
  };

  const accessAllows = async (access: HarborAccess, owner: number, boatOwner: number): Promise<boolean> => {
    if (owner === boatOwner) return true;
    if (access === "owner") return false;
    const a = deps.nationOf?.(owner);
    const b = deps.nationOf?.(boatOwner);
    if (access === "nation") return a !== undefined && a === b;
    // peace: 전쟁 중인 나라 빼고 모두(나라를 모르면 받는다)
    if (a === undefined || b === undefined || a === b) return true;
    return !(await (deps.atWar?.(a, b) ?? Promise.resolve(false)));
  };

  const admits = async (
    buildingId: number,
    facilityOwner: number | null,
    boatOwner: number,
  ): Promise<boolean> =>
    facilityOwner === null ||
    accessAllows(facility(buildingId, facilityOwner).access, facilityOwner, boatOwner);

  const homedAt = (buildingId: number): BoatState[] =>
    [...states.values()]
      .filter((state) => state.homeId === buildingId)
      .toSorted((a, b) => a.boatId - b.boatId);

  const visitingAt = (buildingId: number, _nowMs: number): BoatState[] =>
    [...states.values()]
      .filter((state) => state.tradeId === buildingId)
      .toSorted((a, b) => a.boatId - b.boatId);

  // 요금 화폐 = 그 시설이 선 나라 화폐(D-559 1524), 모르면 서버 시험 화폐
  const assetAt = (buildingId: number): string | undefined => deps.feeAssetOf?.(buildingId) ?? deps.feeAsset;

  const balanceOf = (ownerId: number, buildingId: number): bigint => {
    const asset = assetAt(buildingId);
    return asset ? deps.ledger.balanceOf(ownerId, asset) : 0n;
  };

  const cashOf = (facilityOwner: number | null, buildingId: number): bigint => {
    const asset = assetAt(buildingId);
    return asset && facilityOwner !== null
      ? deps.ledger.balanceOf(facilityOwner, asset, buildingLocation(buildingId))
      : 0n;
  };

  const dockedAt = (buildingId: number): BoatState[] =>
    [...states.values()]
      .filter((state) => state.yardId === buildingId)
      .toSorted((a, b) => a.boatId - b.boatId);

  const fuelOf = (state: BoatState): { readonly milli: number; readonly tank: number } => {
    const tank = fuelTankMilli(types().get(state.typeId), deps.rules());
    return { milli: Math.min(tank, state.fuelMilli ?? tank), tank };
  };

  /**
   * 항해 셈(D-559 1529·1533·1540): fuelAtMs부터 지금까지 움직인 시간만큼 연료를 쓰고, 오버히트면 내구도를 더 깎고, 갑판병은 기본 수리를 한다.
   * 바뀌었으면 true. 연료가 바닥나면 오버히트를 끄고 빠르기를 다시 읽는다
   */
  const sail = (state: BoatState, nowMs: number): boolean => {
    const map = mapOfUnit(maps, state.boatId);
    const boat = map?.unitInfo(state.boatId);
    if (!map || !boat || state.yardId !== null) return false;
    const from = state.fuelAtMs ?? nowMs;
    // 셈한 시각은 메모리에서 늘 옮긴다(적는 것은 연료·내구도 ‰가 바뀔 때만 — 다시 켜면 지금 움직임의 출발부터 다시 센다)
    state.fuelAtMs = nowMs;
    if (nowMs <= from) return false;
    const before = {
      fuel: Math.floor((state.fuelMilli ?? -1000) / 1000),
      hull: Math.floor(state.hullPpm / 1000),
    };
    const rules = deps.rules();
    const type = types().get(state.typeId);
    const moving = overlapMs(boat.motion.departAtMs, arrivalAt(boat.motion), from, nowMs);
    const aboard = new Set(map.passengers(state.boatId));
    const count = (post: string): number =>
      Object.entries(state.crew).filter(([id, value]) => value === post && aboard.has(Number(id))).length;
    let hull = state.hullPpm;
    if (moving > 0) {
      const { milli } = fuelOf(state);
      const burn = fuelBurnMilli(type, moving, state.overheat, rules);
      state.fuelMilli = Math.max(0, milli - burn);
      if (state.overheat) hull -= overheatWearPpm(moving, count("engine"), rules);
      if (state.fuelMilli <= 0 && state.overheat) {
        state.overheat = false;
        state.coolUntilMs = nowMs + Math.max(0, rules.overheatCoolMin) * 60_000;
      }
      if (state.fuelMilli <= 0) map.refreshSpeed(state.boatId);
    }
    hull += deckRepairPpm(Math.max(0, hull), count("deck"), nowMs - from, rules);
    state.hullPpm = Math.max(0, Math.min(HULL_FULL, hull));
    return (
      Math.floor((state.fuelMilli ?? -1000) / 1000) !== before.fuel ||
      Math.floor(state.hullPpm / 1000) !== before.hull
    );
  };

  const charge = (
    boatOwner: number,
    facilityOwner: number | null,
    buildingId: number,
    amount: bigint,
    kind: string,
    atMs: number,
  ): bigint => {
    const asset = assetAt(buildingId);
    // 제 시설을 써도 요금을 낸다(D-555 1514 — 그 사업장 금고로)
    if (!asset || facilityOwner === null || amount <= 0n) return 0n;
    const from = deps.ledger.ownerAccount(boatOwner, asset);
    const have = deps.ledger.balance(from);
    const pay = have < amount ? have : amount;
    if (pay <= 0n) return 0n;
    // 사업장 장부(소득세 포함, D-555 1503). 장부가 없는 세계(시험)는 금고로 바로
    if (deps.business?.receive({ from, buildingId, asset, amount: pay, kind, atMs })) return pay;
    deps.ledger.post({
      kind,
      atMs,
      entries: [
        { account: from, amount: -pay },
        // 사업장 금고 = 시설 주인 계정 · 건물 위치(D-548 — 주인 지갑으로 바로 가지 않는다)
        {
          account: deps.ledger.ownerAccount(facilityOwner, asset, buildingLocation(buildingId)),
          amount: pay,
        },
      ],
    });
    return pay;
  };

  const tick = async (nowMs: number): Promise<HarborTick> => {
    const rules = deps.rules();
    const places = deps.places();
    let saved = 0;
    let evicted = 0;
    let fees = 0n;
    for (const state of states.values()) {
      const map = mapOfUnit(maps, state.boatId);
      const boat = map?.unitInfo(state.boatId);
      // 띄우지 않은 2차맵의 배는 건너뛴다(다시 띄우면 그때부터 셈한다 — 지난 시간은 그때의 처지로)
      if (!map || !boat) continue;
      let dirty = settle(state, nowMs);
      if (sail(state, nowMs)) dirty = true;
      // 집: 정박장이 없어지거나 폐허면 잃는다
      if (state.homeId !== null) {
        const home = findBuilding(maps, state.homeId);
        const fac = facilityOf(places, state.homeId);
        // 정박장 2차맵을 띄우지 않았으면(보는 사람이 없음 — ADR 2026-11-15-unloaded-second-maps) 시설 줄로만 본다. 정박료는 띄운 뒤 밀린 날만큼 낸다
        if (places && fac && !home && isBerth(fac.def) && fac.record.conditionPpm > 0) {
          // 그대로
        } else if (!home || !fac || !isBerth(fac.def) || fac.record.conditionPpm <= 0) {
          evict(state);
          evicted += 1;
          dirty = true;
        } else if (home.ownerId !== null) {
          const row = facility(state.homeId, home.ownerId);
          // 받기 범위는 남의 배만 본다. 정박료는 제 배도 낸다(D-555 1514 — 제 정박장 금고로)
          if (
            home.ownerId !== boat.ownerId &&
            !(await accessAllows(row.access, home.ownerId, boat.ownerId))
          ) {
            evict(state);
            evicted += 1;
            dirty = true;
          } else {
            // 정박료(하루마다, 있는 만큼)
            const paidTo = state.feePaidToMs ?? nowMs;
            const days = dueDays(paidTo, nowMs);
            if (days > 0) {
              const fee = BigInt(Math.max(0, row.fee));
              const due = fee * BigInt(days);
              const pay = charge(boat.ownerId, home.ownerId, state.homeId, due, "berth_fee", nowMs);
              fees += pay;
              state.feePaidToMs = paidTo + days * DAY_MS;
              if (pay < due) state.arrears += fee > 0n ? days - Number(pay / fee) : 0;
              else state.arrears = 0;
              if (state.arrears >= Math.max(1, rules.arrearsDays)) {
                evict(state);
                evicted += 1;
              }
              dirty = true;
            } else if (state.feePaidToMs === null) {
              state.feePaidToMs = nowMs;
              dirty = true;
            }
          }
        }
      }
      // 교역 부두: 산 시간이 지나면 초과 요금 또는 끝
      if (state.tradeId !== null && state.tradeUntilMs !== null && nowMs > state.tradeUntilMs) {
        const dock = findBuilding(maps, state.tradeId);
        if (!dock || !near(state.boatId, dock, rules.harborReachCells, nowMs)) {
          state.tradeId = null;
          state.tradeUntilMs = null;
          state.tradeChargedToMs = null;
          dirty = true;
        } else {
          const chargedTo = Math.max(state.tradeChargedToMs ?? state.tradeUntilMs, state.tradeUntilMs);
          const hours = Math.ceil((nowMs - chargedTo) / HOUR_MS);
          if (hours > 0) {
            const row = facility(state.tradeId, dock.ownerId);
            const due =
              BigInt(Math.max(0, row.fee)) * BigInt(Math.max(1, rules.tradeOverstayMul)) * BigInt(hours);
            fees += charge(boat.ownerId, dock.ownerId, state.tradeId, due, "dock_overstay_fee", nowMs);
            state.tradeChargedToMs = chargedTo + hours * HOUR_MS;
            dirty = true;
          }
        }
      }
      if (dirty) {
        saveState(state);
        saved += 1;
      }
    }
    return { boats: states.size, saved, evicted, fees };
  };

  return {
    states,
    stateOf,
    create,
    account(state, nowMs) {
      const worn = settle(state, nowMs);
      if (sail(state, nowMs) || worn) saveState(state);
    },
    dockedAt,
    fuelEmpty,
    fuelOf,
    assetAt,
    hullOf,
    modeOf,
    settle,
    typeOf: (state) => (state ? types().get(state.typeId) : undefined),
    facility,
    saveFacility(row) {
      settings.set(row.buildingId, { ...row });
      store.saveFacility(row);
    },
    admits,
    homedAt,
    visitingAt,
    near,
    charge,
    balanceOf,
    cashOf,
    saveState,
    remove(boatId) {
      states.delete(boatId);
      store.removeState(boatId);
    },
    tick,
  };
}

/** 정박장·교역 부두 문을 여나(상태 문턱·일하나) */
export function harborAccepts(
  deps: Pick<BoatDeps, "places" | "works" | "rules">,
  buildingId: number,
): "ok" | "not_ready" | "harbor_closed" {
  const fac = facilityOf(deps.places(), buildingId);
  if (!fac || fac.record.level < 1 || !deps.works(buildingId)) return "not_ready";
  return harborOpen(fac.record.conditionPpm, deps.rules()) ? "ok" : "harbor_closed";
}

export type { ShipyardModule };
