// 배 창고 내리기(boat_unload)·싣기(boat_load) — 기획 D-568 "배창고가 가득차면 항구 교역소에 팔거나 부두의 자신창고에 보관", D-570 1823 "항구에 정박하면 교역을 위한
// 물건 상하역", D-555 1505 "자동운반이란 어떤 유닛이든 실제로 옮겨야한다", docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (D-564·D-568)"·"바뀜 (D-570)"·"바뀜 (boats-5)".
// - 정박(port.ts): 교역 부두(누구 것이든)는 시간을 사고 둘레에 대어 있을 때, 정박장은 그 배의 집 정박장 둘레에 대어 있을 때. 조선소는 아니다.
// - 내리기: 배 창고 물건을 모두 그 항구의 물건 자리로 — 항구 옆 물자 거래소 건물이 있고 개인 창고에 들어가면 그 건물 창고의 내 몫(거기서 판다, D-561 "거래소로
//   실어 나른 물건만"), 아니면 그 도시의 내 창고. 바로 시장가로 파는 것은 질문(1823 나).
// - 싣기: 항구 옆 거래소 건물 창고 → 그 도시 내 창고 차례로 그 아이템을 묶음 수만큼(모두 있어야 — 모자라면 insufficient_materials). 배 창고 상한(배 종류 holdKg,
//   나르는 중인 싣는 짐까지 센다)을 넘으면 hold_full. 교역 물건·연료 아이템·포획 장비·식량을 배에 싣는 길이다(바다에서 승객이 먹는 규칙은 아직 없다 — 질문 2068).
// - 실제 운반(D-555 1505, 질문 2069·2070 기획 대조): 배 창고와 물건 자리 사이는 운반꾼이 지고 걷는다(deps.carrier — gather/station.ts carry, 거래소 넣기와 같은
//   운반꾼·시간 셈). 운반꾼 = 그 배 시설 일꾼 → 배 주인의 그 2차맵 휴먼·사이보그 유닛(배에 탄 유닛은 빼낸다). 쓸 유닛이 없으면 no_carrier(물건은 그대로).
//   내리는 짐은 떠날 때 배 창고에서 운반꾼 화물로 간다(배 창고가 바로 빈다). 싣는 짐은 떠날 때 물건 자리에서 운반꾼 화물로 가고, 닿을 때 배가 그 항구에
//   없으면(떠남·시간 끝·주인 바뀜) 꺼낸 자리로 돌려놓는다. 옮김 셈 끔·거리 0·운반 고리가 없으면 예전처럼 바로 옮긴다(거래 하나).
// - 창고 시설(무게 상한)로는 내리지 않는다 — 도시 창고는 상한이 없다(질문 411). NPC 배는 내리기·싣기를 쓰지 않는다(npcFleet.ts).
import { cargoLocation } from "@terra/shared/goodsPlaces";
import type { CarryResult } from "../gather/station.ts";
import type { CellPoint } from "@terra/sim";
import type { FacilityCatalog } from "../facilities/catalog.ts";
import { goodsAsset } from "../facilities/materials.ts";
import { assetWeightG } from "../facilities/places.ts";
import type { Ledger } from "../economy/ledger.ts";
import { type BoatCommandResult, type BoatDeps, fail } from "./core.ts";
import type { Harbor } from "./harbor.ts";
import { holdCapGrams, holdGrams, holdStacks } from "./hold.ts";
import { type Port, portFailed, portOf } from "./port.ts";

export interface Cargo {
  /** 배 창고를 그 항구의 물건 자리로 내린다(me = 부르는 소유 주체) */
  unload(me: number | undefined, boatId: number, buildingId: number, operator: boolean): BoatCommandResult;
  /** 그 항구의 물건 자리에서 아이템을 묶음 수만큼 배 창고에 싣는다 */
  load(
    me: number | undefined,
    boatId: number,
    buildingId: number,
    item: string,
    lots: number,
    operator: boolean,
  ): BoatCommandResult;
}

/** 실을 수 있는 물건 한 줄(묶음 수) */
export interface LoadableStack {
  readonly item: string;
  readonly lots: number;
}

/** 화면에 싣는 물건 수 상한(한 배 줄) */
const LOADABLE_MAX = 30;

/**
 * 주인마다 그 자리들(원장 위치)에 든 물자(묶음 한 개 이상, 아이템 ID 차례, 30줄까지). 원장 계정을 한 번 훑는다 — 판 읽기용
 */
export function loadableOf(
  ledger: Ledger,
  catalog: Pick<FacilityCatalog, "lotSize"> | undefined,
  owners: ReadonlySet<number>,
  locations: readonly number[],
): Map<number, LoadableStack[]> {
  const sums = new Map<number, Map<string, bigint>>();
  if (!catalog || owners.size === 0) return new Map();
  const where = new Set(locations);
  for (const account of ledger.accounts()) {
    const owner = account.ownerId;
    if (owner === null || !owners.has(owner) || account.location === null || !where.has(account.location))
      continue;
    if (account.balance <= 0n || !account.asset.startsWith("item:")) continue;
    const mine = sums.get(owner) ?? new Map<string, bigint>();
    mine.set(account.asset, (mine.get(account.asset) ?? 0n) + account.balance);
    sums.set(owner, mine);
  }
  const out = new Map<number, LoadableStack[]>();
  for (const [owner, assets] of sums) {
    const rows: LoadableStack[] = [];
    for (const [asset, qty] of assets) {
      const lots = qty / (catalog.lotSize.get(asset) ?? 1n);
      if (lots > 0n) rows.push({ item: asset.slice("item:".length), lots: Number(lots) });
    }
    out.set(owner, rows.toSorted((a, b) => a.item.localeCompare(b.item)).slice(0, LOADABLE_MAX));
  }
  return out;
}

/** 운반 결과 → 배 명령 결과(운반꾼이 걷는 중이면 닿는 시각) */
function carried(result: CarryResult, boatId: number, atMs: number): BoatCommandResult {
  if (typeof result === "string") return fail("no_carrier");
  return result.arriveAtMs > atMs
    ? { ok: true, boatId, walking: true, readyAtMs: result.arriveAtMs }
    : { ok: true, boatId };
}

export function createCargo(deps: BoatDeps, harbor: Harbor): Cargo {
  const { now } = deps;

  /** 같은 거래 하나로 바로 옮긴다(운반 고리 없음·운영자) */
  const moveNow = (
    kind: string,
    owner: number,
    lines: readonly {
      readonly asset: string;
      readonly qty: bigint;
      readonly from: number;
      readonly to: number;
    }[],
  ): void => {
    const entries: { account: number; amount: bigint }[] = [];
    for (const line of lines) {
      entries.push({ account: deps.ledger.ownerAccount(owner, line.asset, line.from), amount: -line.qty });
      entries.push({ account: deps.ledger.ownerAccount(owner, line.asset, line.to), amount: line.qty });
    }
    if (entries.length > 0) deps.ledger.post({ kind, atMs: now(), entries });
  };

  /** 내리는 자리 차례: 항구 옆 거래소 건물 창고(개인 창고에 다 들어가면)와 도시 창고 */
  const unloadTarget = (port: Port, stacks: readonly { asset: string; qty: bigint }[]): number => {
    const exchangeId = port.exchangeId;
    if (
      exchangeId !== null &&
      stacks.some(
        (stack) => deps.exchangeFits?.(port.boatOwner, exchangeId, stack.asset, stack.qty) === false,
      )
    )
      return port.places.length - 1;
    return 0;
  };

  return {
    unload(me, boatId, buildingId, operator) {
      const port = portOf(deps, harbor, me, boatId, buildingId, operator);
      if (portFailed(port)) return port;
      const owner = port.boatOwner;
      const stacks = holdStacks(deps.ledger, owner, boatId);
      if (stacks.length === 0) return fail("hold_empty");
      const from = cargoLocation(boatId);
      // 항구 옆 거래소 건물 창고가 있으면 거기로(개인 창고가 차면 도시 창고), 아니면 도시 창고
      const index = unloadTarget(port, stacks);
      const to = port.places[index];
      const spot = port.spots[index];
      if (to === undefined || spot === undefined || port.cityId === null) return fail("not_ready");
      const carrier = operator ? undefined : deps.carrier?.();
      if (!carrier) {
        moveNow(
          "boat_unload",
          owner,
          stacks.map((stack) => ({ asset: stack.asset, qty: stack.qty, from, to })),
        );
        return { ok: true, boatId };
      }
      const at = now();
      const result = carrier.carry({
        ownerId: owner,
        buildingId,
        mapKey: port.map.mapKey,
        cityId: port.cityId,
        source: from,
        deliverTo: to,
        from: port.at,
        to: spot,
        loads: stacks.map((stack) => ({ asset: stack.asset, qty: stack.qty })),
        atMs: at,
        instantKind: "boat_unload",
      });
      return carried(result, boatId, at);
    },
    load(me, boatId, buildingId, item, lots, operator) {
      const port = portOf(deps, harbor, me, boatId, buildingId, operator);
      if (portFailed(port)) return port;
      const catalog = deps.places()?.catalog();
      if (!catalog) return fail("busy");
      const owner = port.boatOwner;
      const asset = goodsAsset(item);
      const lot = catalog.lotSize.get(asset) ?? 1n;
      const qty = BigInt(Math.max(1, Math.trunc(lots))) * lot;
      const carrier = operator ? undefined : deps.carrier?.();
      const hold = cargoLocation(boatId);
      // 배 창고 상한(배 종류 holdKg) — 나르는 중인 싣는 짐까지
      const room =
        BigInt(holdCapGrams(harbor.typeOf(port.state), deps.rules())) -
        holdGrams(deps.ledger, catalog, owner, boatId) -
        (carrier?.inbound(hold) ?? 0n);
      if (qty * assetWeightG(catalog, asset) > room) return fail("hold_full");
      const takes: { location: number; spot: CellPoint; qty: bigint }[] = [];
      let left = qty;
      for (const [index, location] of port.places.entries()) {
        if (left <= 0n) break;
        const have = deps.ledger.balanceOf(owner, asset, location);
        if (have <= 0n) continue;
        const take = have < left ? have : left;
        takes.push({ location, spot: port.spots[index] ?? port.at, qty: take });
        left -= take;
      }
      if (left > 0n) return fail("insufficient_materials");
      if (!carrier || port.cityId === null) {
        moveNow(
          "boat_load",
          owner,
          takes.map((take) => ({ asset, qty: take.qty, from: take.location, to: hold })),
        );
        return { ok: true, boatId };
      }
      const at = now();
      const cityId = port.cityId;
      let last: BoatCommandResult | undefined;
      for (const take of takes) {
        const result = carrier.carry({
          ownerId: owner,
          buildingId,
          mapKey: port.map.mapKey,
          cityId,
          source: take.location,
          deliverTo: hold,
          from: take.spot,
          to: port.at,
          loads: [{ asset, qty: take.qty }],
          atMs: at,
          instantKind: "boat_load",
          // 닿을 때 배가 그 항구에 없으면(떠남·시간 끝·주인 바뀜) 꺼낸 자리로
          redirect: () =>
            portFailed(portOf(deps, harbor, owner, boatId, buildingId, false)) ? take.location : undefined,
        });
        const outcome = carried(result, boatId, at);
        // 첫 짐이 못 떠나면 아무것도 옮기지 않았다. 뒤 짐이 못 떠나면(드묾 — 같은 운반꾼이 합쳐 진다) 떠난 짐만 간다
        if (!outcome.ok) {
          if (!last) return outcome;
          break;
        }
        // 뒤 짐이 앞 짐에 합쳐지면 닿는 시각이 늦어진다 — 마지막 결과가 그 시각이다
        last = outcome;
      }
      return last ?? { ok: true, boatId };
    },
  };
}
