// 함포 칸 포획 장비(boat_gear)와 배 채집 일꾼 — 기획 D-570 1821 "어선의 함포칸에 장비하는 포획장비에 따라 채집가능한 최대티어가 정해지고 유닛들마다
// 채집티어확률로 적용됨. 함포처럼 채집사이클 및 포획장비마다 유닛배치. 어선은 함장1명 및 낚시선원 3명 이런식으로 배정됨.", docs/adr/2026-11-15-shipyard-harbor.md
// "바뀜 (D-570)".
// - 달기: 정박한 항구(port.ts)에서 배 종류 catchGear에 있는 아이템을 함포 칸 하나에 단다. 장비 아이템 한 묶음을 배 창고 → 항구 옆 거래소 건물 창고 → 그 도시
//   내 창고 차례로 꺼내 배에 붙인다(원장 sink:item:<ID> — 배의 일부가 된다, 건물 재료와 같은 계정). 칸에 다른 장비가 있으면 먼저 뗀다.
// - 떼기: 장비를 배 창고로 돌려준다(원장 source:item:<ID>, 배 창고가 차면 그 도시 내 창고로). 장비는 배에 남아 배 주인이 바뀌어도(빼앗기·압류 뒤 넘어감) 함께 간다.
// - 장비를 단 칸의 함포는 쉰다(해상 전투 몸 navalHooks.boatBody가 그 칸을 뺀다).
// - 일꾼(catchCrew): 보직이 낚시 선원(fisher)이고 배에 탄 유닛을 유닛 번호 차례로, 장비를 단 칸 차례에 하나씩 짝짓는다(함포 하나에 화포수 하나와 같은 틀). 짝이
//   없는 선원·선원이 없는 장비는 쉰다. 일꾼이 없으면 채집 줄을 시킨 유닛 혼자 설정 칸 boat_bare_catch_tier까지 잡는다(gather/boatCrew.ts).
import { mountedCatchGear } from "@terra/shared/naval";
import { cargoLocation } from "@terra/shared/goodsPlaces";
import { goodsAsset } from "../facilities/materials.ts";
import { assetWeightG } from "../facilities/places.ts";
import type { BoatCatch } from "../gather/boatCrew.ts";
import { type BoatCommandResult, type BoatDeps, fail, mapOfUnit } from "./core.ts";
import type { Harbor } from "./harbor.ts";
import { holdCapGrams, holdGrams } from "./hold.ts";
import { type Port, portFailed, portOf } from "./port.ts";

export interface BoatGear {
  /** 함포 칸에 포획 장비를 달거나(item) 뗀다(null) */
  mount(
    me: number | undefined,
    boatId: number,
    buildingId: number,
    slot: number,
    item: string | null,
    operator: boolean,
  ): BoatCommandResult;
  /** 배 채집 일꾼(낚시 선원 ↔ 단 장비)과 장비 없이 잡는 티어. 배가 아니면 undefined */
  catchCrew(boatId: number): BoatCatch | undefined;
}

export function createBoatGear(deps: BoatDeps, harbor: Harbor): BoatGear {
  const { now } = deps;

  /** 칸의 장비를 뗀다(배 창고 → 차면 항구 도시 창고). 뗀 아이템(없으면 null) */
  const takeOff = (port: Port, slot: number, at: number, operator: boolean): string | null => {
    const item = port.state.gear[slot] ?? null;
    if (item === null) return null;
    port.state.gear[slot] = null;
    if (operator) return item;
    const catalog = deps.places()?.catalog();
    const asset = goodsAsset(item);
    const qty = catalog?.lotSize.get(asset) ?? 1n;
    const room = catalog
      ? BigInt(holdCapGrams(harbor.typeOf(port.state), deps.rules())) -
        holdGrams(deps.ledger, catalog, port.boatOwner, port.state.boatId)
      : 0n;
    const weight = catalog ? qty * assetWeightG(catalog, asset) : 0n;
    const to = weight <= room ? cargoLocation(port.state.boatId) : (port.places.at(-1) ?? null);
    if (to === null) return item;
    deps.ledger.post({
      kind: "boat_gear_off",
      atMs: at,
      entries: [
        { account: deps.ledger.systemAccount(`source:${asset}`, asset), amount: -qty },
        { account: deps.ledger.ownerAccount(port.boatOwner, asset, to), amount: qty },
      ],
    });
    return item;
  };

  return {
    mount(me, boatId, buildingId, slot, item, operator) {
      const port = portOf(deps, harbor, me, boatId, buildingId, operator);
      if (portFailed(port)) return port;
      const type = harbor.typeOf(port.state);
      const slots = type?.naval?.guns.length ?? 0;
      if (!Number.isInteger(slot) || slot < 0 || slot >= slots) return fail("bad_slot");
      const at = now();
      const gear = port.state.gear;
      while (gear.length < slots) gear.push(null);
      if (item === null) {
        takeOff(port, slot, at, operator);
        harbor.saveState(port.state);
        return { ok: true, boatId };
      }
      if (!type?.catchGear?.some((row) => row.item === item)) return fail("not_catch_gear");
      if (gear[slot] === item) return { ok: true, boatId };
      if (!operator) {
        // 새 장비 한 묶음을 꺼낼 수 있는지 먼저 본다(옛 장비를 떼기 전에)
        const catalog = deps.places()?.catalog();
        const asset = goodsAsset(item);
        const qty = catalog?.lotSize.get(asset) ?? 1n;
        const from = [cargoLocation(boatId), ...port.places].find(
          (location) => deps.ledger.balanceOf(port.boatOwner, asset, location) >= qty,
        );
        if (from === undefined) return fail("insufficient_materials");
        deps.ledger.post({
          kind: "boat_gear_on",
          atMs: at,
          entries: [
            { account: deps.ledger.ownerAccount(port.boatOwner, asset, from), amount: -qty },
            { account: deps.ledger.systemAccount(`sink:${asset}`, asset), amount: qty },
          ],
        });
      }
      takeOff(port, slot, at, operator);
      gear[slot] = item;
      harbor.saveState(port.state);
      return { ok: true, boatId };
    },
    catchCrew(boatId) {
      const state = harbor.states.get(boatId);
      const map = mapOfUnit(deps.maps, boatId);
      if (!state || !map) return undefined;
      const type = harbor.typeOf(state);
      const mounted = mountedCatchGear(state.gear, type?.naval?.guns.length ?? 0, type?.catchGear);
      const fishers = Object.entries(state.crew)
        .filter(([id, post]) => post === "fisher" && map.unitInfo(Number(id))?.aboard === boatId)
        .map(([id]) => Number(id))
        .toSorted((a, b) => a - b);
      const pairs: { unitId: number; maxTier: number }[] = [];
      for (const [index, unitId] of fishers.entries()) {
        const row = mounted[index];
        if (!row) break;
        pairs.push({ unitId, maxTier: row.gear.maxTier });
      }
      return { fishers: pairs, bareMaxTier: Math.max(0, deps.rules().bareCatchTier) };
    },
  };
}
