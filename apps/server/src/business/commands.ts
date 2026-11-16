// 사업장 장부 명령(서버 권위, 프로토콜 34 — packages/protocol/src/business.ts) — 기획 D-548·D-555, docs/adr/2026-11-15-business-ledger.md
// 건물 게이트웨이(facilities/gateway.ts)가 받아 건물 서비스의 고리로 여기에 넘긴다(app.ts 1,000줄 상한 — 새 게이트웨이를 잇지 않는다).
// - 정산(1501·1502): 주인 또는 대주주(바뀜 2047 — D-573: 지분을 팔아 대주주가 아닌 건물 주인도). 적자를 먼저 갚고 남은 돈(금액이 있으면 그만큼)을 지분 수대로.
// - 넣기: 주인·대주주가 자기 지갑에서. 적자를 바로 갚는다(멈춘 사업장이 다시 돈다).
// - 사기(1507): 그 건물 주인의 사업장 창고 물건(임대형 임차인 몫은 아니다). 값 = 주인이 정한 1단위 값(없으면 팩 기준 값 [임시]), 0이면
//   팔지 않는다(D-564 1627 "판매가를 정하고 모두가 그 가격에 구매" — 너무 낮으면 남이 다 사 가고, 너무 높으면 안 팔린다). 최소 묶음
//   (business_min_lot)부터, 그 도시 행정 레벨이 business_retail_max_admin 이하(저급 도시)면 낱개도(소매). 돈은 사업장 금고로(매출 business_sale,
//   소득세). 멈춘 사업장은 팔지 않는다(1504).
//   바뀜 (기획 D-569 1781 "주인이 꺼내는 기능은 존재하지 않는다 무조건 판매이고 재무상태로 수익으로 잡혀야한다"): 주인도 누구나와 같은 판매다 —
//   같은 판매가(0이면 주인도 못 산다 — 값을 먼저 정한다)·같은 최소 묶음. 주인 지갑 → 사업장 금고가 매출(손익계산서 판매 칸)로 잡힌다. 주인이 꺼내는
//   길(storage_move out의 값 받기)은 없앴다(건물 서비스가 sale_only로 거절).
//   바뀜 (D-569 1784 "거래소 반입은 실제 운반만"): 산 물건은 운반꾼(그 건물 일꾼 또는 산 사람의 유닛)이 그 도시의 산 사람 도시 창고로 걸어 나른다
//   (carry 고리 — gather/station.ts haulOut). 운반꾼이 없으면 no_carrier(돈·물건 그대로). 옮김 셈을 끄거나 거리 0이면 예전처럼 바로 도시 창고로.
// - 값 정하기: 주인·대주주. 원장 물자, 그리고 외주 수리 시간당 요금(REPAIR_SERVICE_ITEM — 수리 줄이 있는 공방만, 기획 D-570 1785 "요금은 주인이
//   정한다"). 수리 요금을 정하지 않았으면 적정가(fairPrice.ts — 그 공방 시간당 재료비(2167)·일꾼 시간당 인건비·수수료·세금)로 받고, 0이면 외주를 받지 않는다.
//   배 판매가(boat:<종류> — 기획 대조 2057·2072: 그 종류를 만드는 조선소만, 0 = 만들지 않음, 정하지 않으면 적정가 — boats/shipyard.ts).
// - 지급준비율(D-564 1623): 주인 또는 대주주(D-570 1790 — D-555 1502). 정산이 이 비율로 금고에 돈을 남긴다(core.ts·reserve.ts).
// - 선물(1508): 내 유닛의 유닛 지갑(@terra/shared/businessBooks unitPurseLocation)에 내 지갑 돈을 준다.
// - 화폐는 서버 시험 화폐가 기본 [임시](요금·임금과 같다). 넣기·정산은 고른 화폐.
import type { BusinessResultCode } from "@terra/protocol";
import {
  FX_FEE_ITEM,
  REPAIR_SERVICE_ITEM,
  businessLocation,
  isReservePm,
  unitPurseLocation,
} from "@terra/shared/businessBooks";
import { type FairPrice, serviceFeeOf } from "@terra/shared/fairPrice";
import { cityLocation } from "@terra/shared/goodsPlaces";
import { boatTypeOfPriceItem } from "@terra/shared/harbor";
import type { BusinessCoefficients } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { FacilityCatalog } from "../facilities/catalog.ts";
import type { BusinessCore } from "./core.ts";
import { hourlyFair } from "./fairPrice.ts";
import type { ShareMarkets } from "./shares.ts";

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
  | { readonly kind: "gift"; readonly unitId: number; readonly amount: bigint }
  | {
      readonly kind: "share_order";
      readonly buildingId: number;
      readonly side: "buy" | "sell";
      readonly price: bigint;
      readonly shares: bigint;
    }
  | { readonly kind: "share_cancel"; readonly orderId: number }
  | { readonly kind: "reserve"; readonly buildingId: number; readonly reservePm: number | null };

export type BusinessCommandResult =
  | { readonly ok: true; readonly paid?: bigint; readonly orderId?: number }
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
  /**
   * 산 물건 나르기(기획 D-569 1784): 판 사람(seller)의 그 건물 창고 asset qty를 산 사람(buyer)의 그 도시 창고로 운반꾼이 나른다(물건은 떠날 때
   * 운반꾼 화물로 옮겨진다). null = 떠남, undefined = 나를 거리가 없음(옮김 셈 끔·거리 0 — 부르는 쪽이 바로 옮긴다), 그 밖 = 건물 결과 코드
   * (unknown_unit·unit_busy = 운반꾼 없음). 없으면 늘 바로
   */
  readonly carry?:
    | ((
        seller: number,
        buyer: number,
        buildingId: number,
        asset: string,
        qty: bigint,
        atMs: number,
      ) => string | null | undefined)
    | undefined;
  cityAdminLevel(cityId: number): number | undefined;
  /** 사용자의 소유 주체(없으면 undefined) */
  ownerOf(userId: string, atMs: number): number | undefined;
  readonly fallbackAsset: string;
  readonly now: () => number;
  /** 바뀐 것을 커밋까지 기다린다 */
  durable(): Promise<void>;
  /** 생산시설 지분 시장(shares.ts). 없으면 지분 주문은 busy */
  readonly shares?: (() => ShareMarkets | undefined) | undefined;
  /** 그 건물이 장비 수리 줄이 있는 공방인가(외주 수리 요금을 정할 수 있다). 없으면 늘 false */
  readonly repairShop?: ((buildingId: number) => boolean) | undefined;
  /** 그 공방 일꾼 시간당 인건비(labor/service.ts hourlyLabor — 적정가). 없으면 0 */
  readonly laborHourly?: ((buildingId: number) => bigint) | undefined;
  /** 그 공방이 외주 수리에 내는 시간당 재료비(적정가 몫, 기획 대조 2167). 없으면 0 */
  readonly materialsHourly?: ((buildingId: number) => bigint) | undefined;
  /** 그 건물(조선소)이 만드는 배 종류 ID(배 판매가 boat:<종류>를 정할 수 있다 — 기획 대조 2057). 없으면 빈 목록 */
  readonly boatTypes?: ((buildingId: number) => readonly string[]) | undefined;
  /** 그 건물이 외환 거래소인가(환전 이용료 요율 service:fx_fee를 정할 수 있다 — 질문 2086). 없으면 늘 false */
  readonly fxShop?: ((buildingId: number) => boolean) | undefined;
}

export interface BusinessCommands {
  /**
   * 명령 하나. operator = 운영자 모드 연결(전체 보기 + 모든 유닛 명령 권한, 기획 D-560 — 사용자 요청 2026-11-15 "운영자도 조작가능"): 관리 명령
   * (정산·넣기·값 정하기)을 주인·대주주가 아니어도 한다. 사고팔기(물건·지분)는 운영자도 자기 지갑으로 한다
   */
  run(userId: string, command: BusinessCommand, operator?: boolean): Promise<BusinessCommandResult>;
  /** 사업장 창고 1단위 판매 값(누구에게나 — 주인도, 주인이 정한 값 → 팩 기준 값). 팔지 않으면 null */
  priceOf(buildingId: number, asset: string): bigint | null;
  /** 판매 최소 묶음·소매 도시인가 */
  lotOf(buildingId: number): { minLot: number; retail: boolean };
  /**
   * 채집소 자동 옮김의 주인 구매(기획 D-569 1781 — gather/station.ts ownerSale): buyer가 그 사업장 창고 asset을 qty까지 판매가로 산다(지갑이 되는
   * 만큼, 최소 묶음 아래면 0 — 소매 도시 빼고). 돈 → 금고(매출 business_sale, 소득세). 물건은 부르는 쪽이 옮긴다. 산 수량(값 0·멈춘 사업장은 0)
   */
  sellTo(buyer: number, buildingId: number, asset: string, qty: bigint, atMs: number): bigint;
  /**
   * 외주 수리 시간당 적정가(기획 D-570 1822 — 바뀜 2167: 공방이 내는 시간당 재료비 + 인건비 + 수수료 + 세금). 화면이 요금을 정할 때 곁에 보이고, 요금을
   * 정하지 않은 공방은 이 값으로 받는다
   */
  repairFair(buildingId: number): FairPrice;
  /** 지금 받는 외주 수리 시간당 요금(정한 값, 없으면 적정가). 정했는지도 */
  repairRate(buildingId: number): { readonly perHour: bigint; readonly set: boolean };
  /**
   * 외주 수리 요금(기획 D-570 1785 "그 공방 일꾼이 고치고 요금은 주인이 정한다"): 시간당 요금 × 걸리는 시간, 올림. 받지 않으면(요금 0) null
   */
  repairFee(buildingId: number, ms: number): bigint | null;
  /** 그 사람 지갑(기본 화폐)에 fee가 있나 */
  canPay(ownerId: number, fee: bigint): boolean;
  /** 외주 요금을 낸다: 지갑 → 그 사업장 금고(소득세). 모자라면 "insufficient_funds" */
  chargeService(
    ownerId: number,
    buildingId: number,
    fee: bigint,
    kind: string,
    atMs: number,
  ): "insufficient_funds" | null;
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

  const repairFair = (buildingId: number): FairPrice => {
    const ownerId = deps.place(buildingId)?.ownerId ?? null;
    return hourlyFair(deps.laborHourly?.(buildingId) ?? 0n, {
      feePm: deps.rules().serviceFeePm,
      taxBp: ownerId === null ? 0 : core.taxRateOf(buildingId, ownerId),
      materials: deps.materialsHourly?.(buildingId) ?? 0n,
    });
  };
  const repairRate = (buildingId: number): { perHour: bigint; set: boolean } => {
    const set = core.price(buildingId, REPAIR_SERVICE_ITEM);
    return set === undefined
      ? { perHour: repairFair(buildingId).price, set: false }
      : { perHour: set, set: true };
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

  /** 사업장을 찾고 주인·대주주인지 본다 */
  const managed = (
    me: number,
    buildingId: number,
    operator: boolean,
  ): { ok: true; ownerId: number } | { ok: false; code: BusinessResultCode } => {
    const place = deps.place(buildingId);
    if (!place) return { ok: false, code: "unknown_building" };
    if (place.ownerId === null || !deps.isBusiness(buildingId)) return { ok: false, code: "not_business" };
    if (!operator && !core.mayManage(buildingId, me)) return { ok: false, code: "forbidden" };
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
    // 주인도 누구나와 같은 판매(D-569 1781): 같은 값·같은 최소 묶음
    const unit = priceOf(buildingId, asset);
    if (unit === null) return fail("not_for_sale");
    const lot = lotOf(buildingId);
    if (!lot.retail && qty < lot.minLot) return fail("below_lot");
    const amount = BigInt(qty);
    const here = businessLocation(buildingId);
    if (ledger.balanceOf(seller, asset, here) < amount) return fail("insufficient_goods");
    const cost = unit * amount;
    const wallet = ledger.ownerAccount(me, deps.fallbackAsset);
    if (ledger.balance(wallet) < cost) return fail("insufficient_funds");
    // 물건부터 운반꾼에 싣는다(운반꾼이 없으면 돈·물건 그대로 — D-569 1784). 거리가 없으면 바로 도시 창고로
    const carried = deps.carry?.(seller, me, buildingId, asset, amount, atMs);
    if (carried === "unknown_unit" || carried === "unit_busy") return fail("no_carrier");
    if (carried === "insufficient_materials") return fail("insufficient_goods");
    if (typeof carried === "string") return fail("no_place");
    if (carried === undefined)
      ledger.post({
        kind: "business_sale_goods",
        atMs,
        entries: [
          { account: ledger.ownerAccount(seller, asset, here), amount: -amount },
          { account: ledger.ownerAccount(me, asset, cityLocation(place.cityId)), amount },
        ],
      });
    // 돈은 사업장 금고로 — 매출(business_sale, 주인이 사도 같다) + 소득세
    core.receive({
      from: wallet,
      buildingId,
      asset: deps.fallbackAsset,
      amount: cost,
      kind: "business_sale",
      atMs,
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

  const decide = (
    me: number,
    command: BusinessCommand,
    atMs: number,
    operator: boolean,
  ): BusinessCommandResult => {
    switch (command.kind) {
      case "share_order": {
        const shares = deps.shares?.();
        if (!shares) return fail("busy");
        const placed = shares.place(
          me,
          command.buildingId,
          command.side,
          command.price,
          command.shares,
          atMs,
        );
        return placed.ok ? { ok: true, orderId: placed.orderId } : fail(placed.code);
      }
      case "share_cancel": {
        const shares = deps.shares?.();
        if (!shares) return fail("busy");
        const cancelled = shares.cancel(me, command.orderId, atMs);
        return cancelled.ok ? { ok: true } : fail(cancelled.code);
      }
      case "gift":
        return gift(me, command.unitId, command.amount, atMs);
      case "buy":
        return buy(me, command.buildingId, command.item, command.qty, atMs);
      case "settle": {
        // 정산(D-555 1502 "주인 또는 대주주", 기획 대조 2047 — D-573): 건물 주인은 지분을 팔아 대주주가 아니어도 정산한다
        const owner = deps.place(command.buildingId)?.ownerId === me;
        const found = managed(me, command.buildingId, operator || owner);
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
        // 넣기도 주인 또는 대주주(정산과 같다 — 2047)
        const owner = deps.place(command.buildingId)?.ownerId === me;
        const found = managed(me, command.buildingId, operator || owner);
        if (!found.ok) return fail(found.code);
        if (!isMoney(command.asset)) return fail("not_money");
        if (command.amount <= 0n) return fail("invalid_amount");
        if (!core.invest(command.buildingId, me, command.asset, command.amount, atMs))
          return fail("insufficient_funds");
        return { ok: true, paid: command.amount };
      }
      case "reserve": {
        // 지급준비율(D-564 1623): 주인 또는 대주주(D-570 1790 — D-555 1502 "주인 또는 대주주", 운영자 모드도)가 고른다. null = 설정 칸 기본값
        const owner = deps.place(command.buildingId)?.ownerId === me && deps.isBusiness(command.buildingId);
        const found = managed(me, command.buildingId, operator || owner);
        if (!found.ok) return fail(found.code);
        if (command.reservePm !== null && !isReservePm(command.reservePm)) return fail("invalid_amount");
        core.setReserve(command.buildingId, command.reservePm);
        return { ok: true };
      }
      case "price": {
        const found = managed(me, command.buildingId, operator);
        if (!found.ok) return fail(found.code);
        // 외주 수리 시간당 요금(D-570 1785)은 수리 줄이 있는 공방만, 배 판매가(2057·2072)는 그 배 종류를 만드는 조선소만
        // 환전 이용료 요율(질문 2086)은 외환 거래소만, 위 끝(설정 칸 exchange_fx_fee_max_bp)까지
        if (command.item === FX_FEE_ITEM) {
          if (deps.fxShop?.(command.buildingId) !== true) return fail("not_goods");
          const max = BigInt(Math.max(0, Math.trunc(deps.rules().exchangeFxFeeMaxBp)));
          if (command.price < 0n || command.price > max) return fail("invalid_amount");
          core.setPrice(command.buildingId, command.item, command.price);
          return { ok: true };
        }
        const service = command.item === REPAIR_SERVICE_ITEM;
        const boat = boatTypeOfPriceItem(command.item);
        if (
          service
            ? deps.repairShop?.(command.buildingId) !== true
            : boat !== undefined
              ? !(deps.boatTypes?.(command.buildingId) ?? []).includes(boat)
              : !deps.catalog().isGoods(command.item.slice(5))
        )
          return fail("not_goods");
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
    async run(userId, command, operator = false) {
      const atMs = deps.now();
      const me = deps.ownerOf(userId, atMs);
      if (me === undefined) return fail("busy");
      const result = decide(me, command, atMs, operator);
      if (result.ok) await deps.durable();
      return result;
    },
    priceOf,
    lotOf,
    sellTo(buyer, buildingId, asset, qty, atMs) {
      const place = deps.place(buildingId);
      if (!place || place.ownerId === null || !deps.isBusiness(buildingId) || core.suspended(buildingId))
        return 0n;
      const unit = priceOf(buildingId, asset);
      if (unit === null || qty <= 0n) return 0n;
      const have = ledger.balanceOf(place.ownerId, asset, businessLocation(buildingId));
      const wallet = ledger.ownerAccount(buyer, deps.fallbackAsset);
      const afford = ledger.balance(wallet) / unit;
      let n = qty < have ? qty : have;
      if (afford < n) n = afford;
      const lot = lotOf(buildingId);
      if (n <= 0n || (!lot.retail && n < BigInt(lot.minLot))) return 0n;
      core.receive({
        from: wallet,
        buildingId,
        asset: deps.fallbackAsset,
        amount: unit * n,
        kind: "business_sale",
        atMs,
      });
      return n;
    },
    repairFair,
    repairRate,
    repairFee(buildingId, ms) {
      const rate = repairRate(buildingId);
      if (rate.perHour <= 0n) return null;
      return serviceFeeOf(rate.perHour, ms);
    },
    canPay: (ownerId, fee) => ledger.balance(ledger.ownerAccount(ownerId, deps.fallbackAsset)) >= fee,
    chargeService(ownerId, buildingId, fee, kind, atMs) {
      if (fee <= 0n) return null;
      const wallet = ledger.ownerAccount(ownerId, deps.fallbackAsset);
      if (ledger.balance(wallet) < fee) return "insufficient_funds";
      core.receive({ from: wallet, buildingId, asset: deps.fallbackAsset, amount: fee, kind, atMs });
      return null;
    },
  };
}
