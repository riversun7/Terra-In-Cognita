// 도시 지분 시장·증권 거래소 조회(tRPC shares.city·shares.hub) — 기획 D-583(질문 2438 답 "정부건물 내 전체지분 조회기능, 호가창처럼 …", "증권거래소 건물의
// 주기능 해당 도시나 국가의 정부 지분이나 사업장 지분 거래 가능"), docs/adr/2026-11-21-share-market.md. 읽기만 한다(시장·원장을 바꾸지 않는다 —
// 사업장 지분은 ShareMarkets.view, 도시는 market.view·잔고 읽기만. 계정·시장을 새로 만들지 않는다).
// - 도시 판(정부 건물): 그 도시 주주 전체(국고·다른 나라·가문·플레이어 — 이름·몫)와 그 나라 전체 주주, 호가창(값마다 주)·지금 닫으면 날 값·다음 회차,
//   내 계정·내 가문(가문장)의 지분·돈·팔 수 있는 주, 내 걸린 주문, 국고 지분과 국고 팔기 안건 자격(그 나라 사람만).
//   바뀜(줄기 share-market-2, D-587): 국고 주문과 지도자 거두기(2473 다), 보는 사람 나라의 국고 지분 사기 안건 자격(2479 나), 거래세·이용료 요율(2474 다).
//   호가창·회차 기록에는 누가 냈는지 보이지 않는다(2480 — 기술 기본값 [임시]: 주주 명부만 이름, 걸린 주문은 내 것·내 나라 국고 것만).
// - 거래소 판(증권 거래소 건물): 그 건물이 선 도시의 나라 — 그 나라 도시들의 정부 지분 시장 요약과 사업장 지분 시장 요약(그 도시 사업장 전부 +
//   그 나라 다른 도시의 발행·거래 중인 사업장, 위 끝 BUSINESS_ROWS).
import type {
  BusinessShareSummary,
  CityShareHolderView,
  CityShareMarketResponse,
  CityShareMarketView,
  CityShareTreasuryView,
  CityShareSummary,
  CityShareWallet,
  ShareHubResponse,
} from "@terra/shared/cityShares";
import { sharePm } from "@terra/shared/businessBooks";
import { type HouseKey, isHouseKey } from "@terra/shared/governance";
import type { LocalizedName } from "@terra/shared/roster";
import { shareAsset, totalShares } from "@terra/sim";
import type { GovernanceAttached } from "../governance/attach.ts";
import { houseKeyOfTail } from "../governance/houseShares.ts";
import { type NationPreset, nationName } from "../npc/nations.ts";
import { ownerHolder } from "./market.ts";
import type { CitySharePort } from "./port.ts";
import type { CityShareService } from "./service.ts";

/** 거래소 판에 보이는 사업장 줄 위 끝 */
const BUSINESS_ROWS = 60;

const named = (name: string | undefined | null): LocalizedName | null =>
  name ? { ko: name, en: name } : null;

export function createCityShareView(o: {
  readonly port: CitySharePort;
  readonly service: Pick<CityShareService, "ensure" | "actorsOf" | "placeCap" | "holdersOf">;
  readonly governance: () => GovernanceAttached | undefined;
  readonly presets?: (() => readonly NationPreset[]) | undefined;
  readonly now: () => number;
}) {
  const nationOfCity = (cityId: number) =>
    o
      .governance()
      ?.port.nations()
      .find((row) => row.cities.includes(cityId));

  const nationNames = async (rowIds: readonly number[]): Promise<Map<number, LocalizedName | null>> => {
    const g = o.governance();
    if (!g || rowIds.length === 0) return new Map();
    const labels = await g.store.factionLabels(rowIds);
    const presets = o.presets?.() ?? [];
    return new Map(
      rowIds.map((id) => {
        const label = labels.get(id);
        const preset = label?.code ? nationName(label.code, presets) : undefined;
        return [id, preset ?? named(label?.name)];
      }),
    );
  };

  /** 주주 줄(o:<주체> | p:/n:<가문>) → 이름·종류 */
  const holderRows = async (
    rows: readonly { readonly holder: string; readonly amount: bigint }[],
    ctx: {
      treasury: number | undefined;
      me: string | undefined;
      myHouse: HouseKey | undefined;
      ruling: string | null;
    },
  ): Promise<CityShareHolderView[]> => {
    const g = o.governance();
    const total = rows.reduce((sum, row) => sum + row.amount, 0n);
    const houseKeys = rows.map((row) => row.holder).filter((key) => isHouseKey(key));
    const ownerIds = rows.flatMap((row) =>
      row.holder.startsWith("o:") ? [Number(row.holder.slice(2))] : [],
    );
    const infos = new Map(ownerIds.map((id) => [id, g?.port.ownerInfo(id)]));
    const [houseNames, userNames, factions] = await Promise.all([
      g ? g.store.houseNames(houseKeys) : Promise.resolve(new Map<string, string>()),
      g
        ? g.store.userNames([...infos.values()].flatMap((info) => (info?.userId ? [info.userId] : [])))
        : Promise.resolve(new Map<string, string>()),
      nationNames([...infos.values()].flatMap((info) => (info?.factionRow ? [info.factionRow] : []))),
    ]);
    return rows
      .filter((row) => row.amount > 0n)
      .toSorted((a, b) =>
        a.amount === b.amount ? (a.holder < b.holder ? -1 : 1) : a.amount > b.amount ? -1 : 1,
      )
      .map((row): CityShareHolderView => {
        const base = { shares: String(row.amount), pm: sharePm(row.amount, total) };
        if (isHouseKey(row.holder))
          return {
            ...base,
            kind: row.holder === ctx.myHouse ? "my_house" : "house",
            name: named(houseNames.get(row.holder)),
            npc: row.holder.startsWith("n:"),
            ruling: row.holder === ctx.ruling,
          };
        const id = Number(row.holder.slice(2));
        const info = infos.get(id);
        const kind =
          row.holder === ctx.me
            ? "me"
            : id === ctx.treasury
              ? "treasury"
              : info?.userId
                ? "player"
                : info?.playerHouse
                  ? "house"
                  : "nation";
        const name = info?.userId
          ? named(userNames.get(info.userId))
          : info?.factionRow
            ? (factions.get(info.factionRow) ?? null)
            : null;
        return { ...base, kind, name, npc: !info?.userId && info?.playerHouse !== true };
      });
  };

  /** 정부 건물 판: 도시 지분 시장 */
  const city = async (userId: string, cityId: number): Promise<CityShareMarketResponse> => {
    const market = await o.service.ensure();
    if (!market || !o.port.ready()) return { status: "not_ready" };
    const asset = o.port.currencyOf(cityId);
    if (asset === undefined) return { status: "unknown_city" };
    const ledger = o.port.ledger();
    const g = o.governance();
    const nowMs = o.now();
    const actors = await o.service.actorsOf(userId);
    const nation = nationOfCity(cityId);
    const state = nation && g ? (await g.store.states()).get(nation.rowId) : undefined;
    const ruling = nation && g ? await g.service.tools.ruling(nation, state) : undefined;
    const ctx = {
      treasury: o.port.cityOwner(cityId),
      me: actors.me,
      myHouse: actors.houseKey,
      ruling: ruling?.key ?? null,
    };
    const parts = o.service.holdersOf(cityId);
    const cityRows = [
      ...parts.owners.map((row) => ({ holder: ownerHolder(row.owner), amount: row.amount })),
      ...parts.houses.flatMap((row) => {
        const key = houseKeyOfTail(row.house);
        return key ? [{ holder: key, amount: row.amount }] : [];
      }),
    ];
    const nationRows =
      nation && g
        ? g.port.holdingsOf(nation).map((row) => ({ holder: row.holder, amount: row.amount }))
        : cityRows;
    const [holders, nationHolders] = await Promise.all([
      holderRows(cityRows, ctx),
      holderRows(nationRows, ctx),
    ]);
    const wallet = async (holder: string | undefined): Promise<CityShareWallet> => {
      if (holder === undefined) return { shares: "0", cash: "0", sellable: "0" };
      const cap = await o.service.placeCap(market, holder, cityId);
      return {
        shares: String(market.shareBalance(holder, cityId)),
        cash: String(market.cashBalance(holder, asset)),
        sellable: String(market.sellable(holder, cityId, cap)),
      };
    };
    const view = market.view(cityId, nowMs);
    const mine = market.ordersOf([actors.me, actors.house].flatMap((holder) => (holder ? [holder] : [])));
    let treasury: CityShareTreasuryView | null = null;
    let treasuryBuy: NonNullable<CityShareMarketView["treasuryBuy"]> | null = null;
    const standing = g ? await g.service.standing(userId) : undefined;
    if (nation && g && standing?.nation.rowId === nation.rowId) {
      const holder = ownerHolder(nation.ownerId);
      treasury = {
        shares: String(ledger?.balanceOf(nation.ownerId, shareAsset(cityId)) ?? 0n),
        canPropose: nation.regime === "dictatorship" ? standing.leader : g.service.mayPropose(standing),
        dictatorship: nation.regime === "dictatorship",
        // 국고 주문(승인된 팔기·사기 — D-587 2473 다·2479 나)과 지도자 거두기
        orders: market
          .orders(cityId)
          .filter((order) => order.holder === holder)
          .map((order) => ({
            id: order.id,
            side: order.side,
            price: String(order.price),
            shares: String(order.shares),
            as: "treasury",
          })),
        canWithdraw: standing.leader,
        cash: String(market.cashBalance(holder, asset)),
      };
    }
    // 국고 지분 사기 안건(질문 2479 나): 보는 사람 나라 국고가 이 도시(제 나라·남의 나라) 지분을 산다
    if (g && standing) {
      const own = standing.nation;
      treasuryBuy = {
        canPropose: own.regime === "dictatorship" ? standing.leader : g.service.mayPropose(standing),
        dictatorship: own.regime === "dictatorship",
        cash: String(market.cashBalance(ownerHolder(own.ownerId), asset)),
        own: nation?.rowId === own.rowId,
      };
    }
    const rate = o.port.levy()?.rateOf(cityId);
    const names = nation ? await nationNames([nation.rowId]) : new Map<number, LocalizedName | null>();
    const total = ledger ? totalShares(ledger, cityId) : 0n;
    return {
      status: "ok",
      cityId,
      cityName: named(o.port.cityName(cityId)),
      nationName: nation ? (names.get(nation.rowId) ?? null) : null,
      regime: nation?.regime ?? null,
      asset,
      total: String(total),
      holders,
      nationTotal: String(nationRows.reduce((sum, row) => sum + row.amount, 0n)),
      nationHolders,
      lastPrice: view.lastPrice === undefined ? null : String(view.lastPrice),
      roundMs: view.roundMs,
      nextRoundMs: view.nextRoundMs,
      book: view.book,
      expected: view.expected
        ? { price: String(view.expected.price), shares: String(view.expected.shares) }
        : null,
      bidShares: String(view.bidShares),
      askShares: String(view.askShares),
      me: await wallet(actors.me),
      house: actors.house === undefined ? null : await wallet(actors.house),
      myOrders: mine
        .filter((order) => order.cityId === cityId)
        .map((order) => ({
          id: order.id,
          side: order.side,
          price: String(order.price),
          shares: String(order.shares),
          as: order.holder === actors.house ? "house" : "me",
        })),
      orderMax: market.orderMax(),
      rounds: view.rounds.map((round) => ({
        atMs: round.atMs,
        price: round.price === undefined ? null : String(round.price),
        shares: String(round.shares),
      })),
      treasury,
      treasuryBuy,
      levy: rate ? { taxBp: rate.taxBp, feeBp: rate.fee?.bp ?? null } : undefined,
    };
  };

  /** 증권 거래소 건물 판: 그 나라 정부 지분·사업장 지분 시장 목록 */
  const hub = async (userId: string, buildingId: number): Promise<ShareHubResponse> => {
    void userId;
    const market = await o.service.ensure();
    const facilities = o.port.facilities();
    const ledger = o.port.ledger();
    if (!market || !facilities || !ledger) return { status: "not_ready" };
    const record = facilities.record(buildingId);
    if (
      !record ||
      facilities.facility(record.facilityId)?.exchange !== "securities" ||
      record.cityId === null
    )
      return { status: "not_exchange" };
    if (record.level < 1) return { status: "stopped" };
    const nowMs = o.now();
    const nation = nationOfCity(record.cityId);
    const cityIds = nation ? nation.cities : [record.cityId];
    const cities: CityShareSummary[] = cityIds.flatMap((cityId) => {
      const asset = o.port.currencyOf(cityId);
      if (asset === undefined) return [];
      const view = market.view(cityId, nowMs);
      return [
        {
          cityId,
          name: named(o.port.cityName(cityId)),
          asset,
          total: String(totalShares(ledger, cityId)),
          lastPrice: view.lastPrice === undefined ? null : String(view.lastPrice),
          bidShares: String(view.bidShares),
          askShares: String(view.askShares),
        },
      ];
    });
    const inNation = new Set(cityIds);
    const businesses: BusinessShareSummary[] = [];
    for (const row of [...facilities.records()].toSorted((a, b) => a.buildingId - b.buildingId)) {
      if (row.cityId === null || !inNation.has(row.cityId) || row.buildingId === buildingId) continue;
      const def = facilities.facility(row.facilityId);
      if (!def) continue;
      const view = facilities.shareView(row.buildingId, nowMs);
      const active =
        view.issued || view.lastPrice !== null || view.bidShares !== "0" || view.askShares !== "0";
      // 그 도시 사업장은 모두, 다른 도시는 발행·거래 중인 것만
      if (row.cityId !== record.cityId && !active) continue;
      businesses.push({
        buildingId: row.buildingId,
        cityId: row.cityId,
        facilityId: row.facilityId,
        name: def.name,
        issued: view.issued,
        lastPrice: view.lastPrice,
        bidShares: view.bidShares,
        askShares: view.askShares,
      });
      if (businesses.length >= BUSINESS_ROWS) break;
    }
    const names = nation ? await nationNames([nation.rowId]) : new Map<number, LocalizedName | null>();
    return {
      status: "ok",
      buildingId,
      cityId: record.cityId,
      nationName: nation ? (names.get(nation.rowId) ?? null) : null,
      nextRoundMs: market.nextRoundMs(nowMs),
      cities,
      businesses,
    };
  };

  return { city, hub };
}

export type CityShareView = ReturnType<typeof createCityShareView>;
