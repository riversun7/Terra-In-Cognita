// 배 창고 내리기(boat_unload)·싣기(boat_load) — 기획 D-568 "배창고가 가득차면 항구 교역소에 팔거나 부두의 자신창고에 보관", D-570 1823 "항구에 정박하면 교역을 위한
// 물건 상하역", docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (D-564·D-568)"·"바뀜 (D-570)".
// - 정박(port.ts): 교역 부두(누구 것이든)는 시간을 사고 둘레에 대어 있을 때, 내 배 시설(정박장·조선소·교역 부두)은 대어 있기만 하면(요금·시간 없음 — 제 부두).
// - 내리기: 배 창고 물건을 모두 그 항구의 물건 자리로 — 항구 옆 물자 거래소 건물이 있으면 그 건물 창고의 내 몫(바로 거래소에 내놓는다, D-561 "거래소로
//   실어 나른 물건만"), 없으면 그 도시의 내 창고(거기서 거래소 건물로 운반꾼이 나른다). 바로 시장가로 파는 것은 질문(1823 나).
// - 싣기: 항구 옆 거래소 건물 창고 → 그 도시 내 창고 차례로 그 아이템을 묶음 수만큼(모두 있어야 — 모자라면 insufficient_materials). 배 창고 상한(배 종류 holdKg)을
//   넘으면 hold_full. 교역 물건·연료 아이템·식량을 배에 싣는 길이다(바다에서 승객이 먹는 규칙은 아직 없다 — 질문 2068).
// - 옮김은 거래 하나(같은 주인). 창고 시설(무게 상한)로는 내리지 않는다 — 도시 창고는 상한이 없다(질문 411).
import { cargoLocation } from "@terra/shared/goodsPlaces";
import type { FacilityCatalog } from "../facilities/catalog.ts";
import { goodsAsset } from "../facilities/materials.ts";
import { assetWeightG } from "../facilities/places.ts";
import type { Ledger } from "../economy/ledger.ts";
import { type BoatCommandResult, type BoatDeps, fail } from "./core.ts";
import type { Harbor } from "./harbor.ts";
import { holdCapGrams, holdGrams, holdStacks } from "./hold.ts";
import { portFailed, portOf } from "./port.ts";

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

export function createCargo(deps: BoatDeps, harbor: Harbor): Cargo {
  const { now } = deps;
  return {
    unload(me, boatId, buildingId, operator) {
      const port = portOf(deps, harbor, me, boatId, buildingId, operator);
      if (portFailed(port)) return port;
      const owner = port.boatOwner;
      const stacks = holdStacks(deps.ledger, owner, boatId);
      if (stacks.length === 0) return fail("hold_empty");
      const from = cargoLocation(boatId);
      // 항구 옆 거래소 건물 창고가 있으면 거기로, 아니면 도시 창고(자리 차례의 첫 자리)
      const to = port.places[0];
      if (to === undefined) return fail("not_ready");
      const entries: { account: number; amount: bigint }[] = [];
      for (const stack of stacks) {
        entries.push({ account: deps.ledger.ownerAccount(owner, stack.asset, from), amount: -stack.qty });
        entries.push({ account: deps.ledger.ownerAccount(owner, stack.asset, to), amount: stack.qty });
      }
      deps.ledger.post({ kind: "boat_unload", atMs: now(), entries });
      return { ok: true, boatId };
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
      // 배 창고 상한(배 종류 holdKg)
      const room =
        BigInt(holdCapGrams(harbor.typeOf(port.state), deps.rules())) -
        holdGrams(deps.ledger, catalog, owner, boatId);
      if (qty * assetWeightG(catalog, asset) > room) return fail("hold_full");
      const entries: { account: number; amount: bigint }[] = [];
      let left = qty;
      for (const location of port.places) {
        if (left <= 0n) break;
        const have = deps.ledger.balanceOf(owner, asset, location);
        if (have <= 0n) continue;
        const take = have < left ? have : left;
        entries.push({ account: deps.ledger.ownerAccount(owner, asset, location), amount: -take });
        left -= take;
      }
      if (left > 0n) return fail("insufficient_materials");
      entries.push({ account: deps.ledger.ownerAccount(owner, asset, cargoLocation(boatId)), amount: qty });
      deps.ledger.post({ kind: "boat_load", atMs: now(), entries });
      return { ok: true, boatId };
    },
  };
}
