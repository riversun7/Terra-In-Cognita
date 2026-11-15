// 사업장 장부 명령(서버 권위, 프로토콜 34 — packages/protocol/src/business.ts) — 기획 D-548·D-555, docs/adr/2026-11-15-business-ledger.md
// 건물 게이트웨이(facilities/gateway.ts)가 받아 건물 서비스의 고리로 여기에 넘긴다(app.ts 1,000줄 상한 — 새 게이트웨이를 잇지 않는다).
// - 정산(1501·1502): 주인·대주주만. 적자를 먼저 갚고 남은 돈(금액이 있으면 그만큼)을 지분 수대로.
// - 넣기: 주인·대주주가 자기 지갑에서. 적자를 바로 갚는다(멈춘 사업장이 다시 돈다).
// - 사기(1507): 그 건물 주인의 사업장 창고 물건(임대형 임차인 몫은 아니다). 값 = 주인이 정한 1단위 값(없으면 팩 기준 값 [임시]), 0이면 남에게
//   팔지 않는다. 주인이 꺼낼 때는 팩 기준 값(주인이 정한 값과 상관없이 [임시] — 장부에 물건 값이 남게). 남에게는 최소 묶음(business_min_lot)부터,
//   그 도시 행정 레벨이 business_retail_max_admin 이하(저급 도시)면 낱개도(소매). 물건은 산 사람의 그 도시 창고로, 돈은 사업장 금고로(소득세).
//   멈춘 사업장은 팔지 않는다(1504).
// - 값 정하기: 주인·대주주. 원장 물자만.
// - 선물(1508): 내 유닛의 유닛 지갑(@terra/shared/businessBooks unitPurseLocation)에 내 지갑 돈을 준다.
// - 화폐는 서버 시험 화폐가 기본 [임시](요금·임금과 같다). 넣기·정산은 고른 화폐.
import type { BusinessResultCode } from "@terra/protocol";
import { businessLocation, unitPurseLocation } from "@terra/shared/businessBooks";
import { cityLocation } from "@terra/shared/goodsPlaces";
import type { BusinessCoefficients } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { FacilityCatalog } from "../facilities/catalog.ts";
import type { BusinessCore } from "./core.ts";

export type BusinessCommand =
  | {
      readonly kind: "settle";
      readonly buildingId: number;
      readonly asset?: string;
      readonly amount?: bigint;
    }
  | { readonly kind: "invest"; readonly buildingId: number; readonly asset: string; readonly amount: bigint }
  | { readonly kind: "buy"; readonly buildingId: number; readonly item: string; readonly qty: number }
  | { readonly kind: "price"; readonly buildingId: number; readonly item: string; readonly price: bigint }
  | { readonly kind: "gift"; readonly unitId: number; readonly amount: bigint };

export type BusinessCommandResult =
  | { readonly ok: true; readonly paid?: bigint }
  | { readonly ok: false; readonly code: BusinessResultCode };

export interface BusinessCommandDeps {
  readonly core: BusinessCore;
  readonly ledger: Ledger;
  /** 유닛 주인(없는 유닛이면 undefined) */
  unitOwner(unitId: number): number | undefined;
  readonly catalog: () => Pick<FacilityCatalog, "isGoods" | "unitPriceOf">;
  readonly rules: () => BusinessCoefficients;
  /** 건물 주인·도시(없으면 undefined), 사업장(시설 줄)인가 */
  place(buildingId: number): { ownerId: number | null; cityId: number | null } | undefined;
  isBusiness(buildingId: number): boolean;
  /** 창고 시설인가(창고 시설은 주인 물건을 맡아 두는 곳 — 꺼낼 때 값을 내지 않는다) */
  isStorage(buildingId: number): boolean;
  cityAdminLevel(cityId: number): number | undefined;
  /** 사용자의 소유 주체(없으면 undefined) */
  ownerOf(userId: string, atMs: number): number | undefined;
  readonly fallbackAsset: string;
  readonly now: () => number;
  /** 바뀐 것을 커밋까지 기다린다 */
  durable(): Promise<void>;
}

export interface BusinessCommands {
  run(userId: string, command: BusinessCommand): Promise<BusinessCommandResult>;
  /**
   * 주인이 제 사업장 창고 물건을 꺼낼 때 값을 낸다(storage_move out, D-555 1507 "주인도 돈을 내고 꺼낸다"). 창고 시설·남의 건물·화폐는 값이 없다.
   * 지갑이 모자라면 "insufficient_funds", 낼 것이 없거나 냈으면 null
   */
  chargeTake(
    ownerId: number,
    buildingId: number,
    asset: string,
    qty: bigint,
    atMs: number,
  ): "insufficient_funds" | null;
  /** 사업장 창고 1단위 판매 값(남에게, 주인이 정한 값 → 팩 기준 값). 팔지 않으면 null */
  priceOf(buildingId: number, asset: string): bigint | null;
  /** 판매 최소 묶음·소매 도시인가 */
  lotOf(buildingId: number): { minLot: number; retail: boolean };
}

const fail = (code: BusinessResultCode): BusinessCommandResult => ({ ok: false, code });

/** 화폐 자산인가(물건 item:<ID>이 아니면) */
const isMoney = (asset: string): boolean => !asset.startsWith("item:");

export function createBusinessCommands(deps: BusinessCommandDeps): BusinessCommands {
  const { core, ledger } = deps;
  const basePrice = (asset: string): bigint => deps.catalog().unitPriceOf?.(asset.slice(5)) ?? 1n;

  const priceOf = (buildingId: number, asset: string): bigint | null => {
    const set = core.price(buildingId, asset);
    if (set !== undefined) return set > 0n ? set : null;
    return basePrice(asset);
  };

  const lotOf = (buildingId: number): { minLot: number; retail: boolean } => {
    const rules = deps.rules();
    const cityId = deps.place(buildingId)?.cityId ?? null;
    const admin = cityId === null ? undefined : deps.cityAdminLevel(cityId);
    const retailMax = Math.max(0, Math.trunc(rules.retailMaxAdmin));
    return {
      minLot: Math.max(1, Math.trunc(rules.minLot)),
      retail: retailMax > 0 && admin !== undefined && admin <= retailMax,
    };
  };

  const chargeTake = (
    ownerId: number,
    buildingId: number,
    asset: string,
    qty: bigint,
    atMs: number,
  ): "insufficient_funds" | null => {
    const place = deps.place(buildingId);
    if (!place || place.ownerId !== ownerId || isMoney(asset) || qty <= 0n) return null;
    if (!deps.isBusiness(buildingId) || deps.isStorage(buildingId)) return null;
    const cost = basePrice(asset) * qty;
    const wallet = ledger.ownerAccount(ownerId, deps.fallbackAsset);
    if (ledger.balance(wallet) < cost) return "insufficient_funds";
    core.receive({
      from: wallet,
      buildingId,
      asset: deps.fallbackAsset,
      amount: cost,
      kind: "business_sale",
      atMs,
    });
    return null;
  };

  /** 사업장을 찾고 주인·대주주인지 본다 */
  const managed = (
    me: number,
    buildingId: number,
  ): { ok: true; ownerId: number } | { ok: false; code: BusinessResultCode } => {
    const place = deps.place(buildingId);
    if (!place) return { ok: false, code: "unknown_building" };
    if (place.ownerId === null || !deps.isBusiness(buildingId)) return { ok: false, code: "not_business" };
    if (!core.mayManage(buildingId, me)) return { ok: false, code: "forbidden" };
    return { ok: true, ownerId: place.ownerId };
  };

  const buy = (
    me: number,
    buildingId: number,
    asset: string,
    qty: number,
    atMs: number,
  ): BusinessCommandResult => {
    const place = deps.place(buildingId);
    if (!place) return fail("unknown_building");
    if (place.ownerId === null || !deps.isBusiness(buildingId)) return fail("not_business");
    if (!deps.catalog().isGoods(asset.slice(5))) return fail("not_goods");
    if (core.suspended(buildingId)) return fail("suspended");
    if (place.cityId === null) return fail("no_place");
    const seller = place.ownerId;
    const own = seller === me;
    const unit = own ? basePrice(asset) : priceOf(buildingId, asset);
    if (unit === null) return fail("not_for_sale");
    const lot = lotOf(buildingId);
    if (!own && !lot.retail && qty < lot.minLot) return fail("below_lot");
    const amount = BigInt(qty);
    const here = businessLocation(buildingId);
    if (ledger.balanceOf(seller, asset, here) < amount) return fail("insufficient_goods");
    const cost = unit * amount;
    const wallet = ledger.ownerAccount(me, deps.fallbackAsset);
    if (ledger.balance(wallet) < cost) return fail("insufficient_funds");
    core.receive({
      from: wallet,
      buildingId,
      asset: deps.fallbackAsset,
      amount: cost,
      kind: "business_sale",
      atMs,
    });
    ledger.post({
      kind: "business_sale_goods",
      atMs,
      entries: [
        { account: ledger.ownerAccount(seller, asset, here), amount: -amount },
        { account: ledger.ownerAccount(me, asset, cityLocation(place.cityId)), amount },
      ],
    });
    return { ok: true, paid: cost };
  };

  const gift = (me: number, unitId: number, amount: bigint, atMs: number): BusinessCommandResult => {
    const ownerId = deps.unitOwner(unitId);
    if (ownerId === undefined) return fail("unknown_unit");
    if (ownerId !== me) return fail("forbidden");
    if (amount <= 0n) return fail("invalid_amount");
    const wallet = ledger.ownerAccount(me, deps.fallbackAsset);
    if (ledger.balance(wallet) < amount) return fail("insufficient_funds");
    ledger.post({
      kind: "unit_gift",
      atMs,
      entries: [
        { account: wallet, amount: -amount },
        { account: ledger.ownerAccount(me, deps.fallbackAsset, unitPurseLocation(unitId)), amount },
      ],
    });
    return { ok: true, paid: amount };
  };

  const decide = (me: number, command: BusinessCommand, atMs: number): BusinessCommandResult => {
    switch (command.kind) {
      case "gift":
        return gift(me, command.unitId, command.amount, atMs);
      case "buy":
        return buy(me, command.buildingId, command.item, command.qty, atMs);
      case "settle": {
        const found = managed(me, command.buildingId);
        if (!found.ok) return fail(found.code);
        if (command.asset !== undefined && !isMoney(command.asset)) return fail("not_money");
        const only =
          command.asset === undefined ? undefined : { asset: command.asset, amount: command.amount ?? 0n };
        const paid = core.settle(command.buildingId, atMs, only);
        if (paid.size === 0)
          return fail(core.debts(command.buildingId).size > 0 ? "in_debt" : "nothing_to_settle");
        return { ok: true, paid: [...paid.values()].reduce((sum, value) => sum + value, 0n) };
      }
      case "invest": {
        const found = managed(me, command.buildingId);
        if (!found.ok) return fail(found.code);
        if (!isMoney(command.asset)) return fail("not_money");
        if (command.amount <= 0n) return fail("invalid_amount");
        if (!core.invest(command.buildingId, me, command.asset, command.amount, atMs))
          return fail("insufficient_funds");
        return { ok: true, paid: command.amount };
      }
      case "price": {
        const found = managed(me, command.buildingId);
        if (!found.ok) return fail(found.code);
        if (!deps.catalog().isGoods(command.item.slice(5))) return fail("not_goods");
        if (command.price < 0n) return fail("invalid_amount");
        core.setPrice(command.buildingId, command.item, command.price);
        return { ok: true };
      }
      default: {
        const unhandled: never = command;
        return unhandled;
      }
    }
  };

  return {
    async run(userId, command) {
      const atMs = deps.now();
      const me = deps.ownerOf(userId, atMs);
      if (me === undefined) return fail("busy");
      const result = decide(me, command, atMs);
      if (result.ok) await deps.durable();
      return result;
    },
    chargeTake,
    priceOf,
    lotOf,
  };
}
