// 도시(정부) 지분 시장 서비스(서버 권위) — 기획 D-583(질문 2438 답), D-344·D-581·D-217, docs/adr/2026-11-21-share-market.md.
// - 시장(market.ts)은 세계가 준비된 뒤 한 번 DB에서 걸린 주문·회차를 읽어 만든다(ensure). 그 전에는 명령이 busy.
// - 명령(WebSocket city_share_order·city_share_cancel): 내 계정(사용자 소유 주체) 또는 내가 이끄는 가문(가문 지분 계정·가문 금고)으로. 국고 지분은
//   사람이 직접 팔지 못하고, 의결이 승인한 국고 지분 팔기(approvedSale — governance approvedShareSale 고리)만 시장에 건다(값 = 승인된 가장 낮은 값,
//   주 수 = 승인 수, 다 팔릴 때까지 남는다).
// - 독재 과반(D-344): 독재 나라 도시에서 지배 쪽(지배 가문 지분 계정 + 지배 플레이어 가문 소유 주체 — 그 나라 국고가 아닐 때)의 팔기와 국고 팔기는
//   지배 쪽 ÷ (합 − 국고) > 500‰가 남는 데까지만(governance/electorate.ts rulingSharePm과 같은 셈 — market.ts majorityCaps). 주문 때와 회차 때 본다.
//   NPC 지배 가문의 팔기는 NPC 판단(@terra/sim society.sellShares — 직접 양도, 과반 지킴)이 그대로 한다(시장으로 옮기기는 질문 2461).
// - 회차: 15초마다 경계를 지났나 보고 지났으면 독재 도시의 과반 끝을 셈한 뒤 모든 도시를 체결한다. 명령·회차는 한 줄로 돈다.
// - 명령의 답은 쓰기 대기열이 커밋된 뒤(writer.durable).
import type { CityShareResultCode } from "@terra/protocol";
import { type HouseKey, isHouseKey } from "@terra/shared/governance";
import { holdingsOf, houseHoldingsOf, totalShares } from "@terra/sim";
import type { GovernanceAttached } from "../governance/attach.ts";
import { houseTailOf } from "../governance/houseShares.ts";
import { parseHouseKey, type GovernanceNation } from "../governance/port.ts";
import type { ApprovedShareSale } from "../governance/service.ts";
import { TEST_PLANET_ID } from "../world/testMaps.ts";
import {
  type CityShareCaps,
  type CityShareMarket,
  type CityShareRules,
  type CityShareSide,
  createCityShareMarket,
  houseHolder,
  majorityCaps,
  ownerHolder,
} from "./market.ts";
import type { CitySharePort } from "./port.ts";
import { loadCityShares } from "./store.ts";

/** 회차 경계를 보는 간격(ms) */
export const CITY_SHARE_TICK_MS = 15_000;

export type CityShareResult =
  | { readonly ok: true; readonly orderId?: number | undefined }
  | { readonly ok: false; readonly code: CityShareResultCode };

/** 보는 사람이 낼 수 있는 쪽 */
export interface CityShareActors {
  readonly me: string | undefined;
  readonly house: string | undefined;
  readonly houseKey: HouseKey | undefined;
}

/** 독재 도시의 지배 쪽(과반 셈) */
export interface RulingSides {
  readonly nation: GovernanceNation;
  readonly sides: ReadonlySet<string>;
  readonly treasury: string;
  readonly key: HouseKey;
}

const fail = (code: CityShareResultCode): CityShareResult => ({ ok: false, code });

export function createCityShareService(o: {
  readonly port: CitySharePort;
  readonly governance: () => GovernanceAttached | undefined;
  readonly rules: () => CityShareRules;
  readonly now: () => number;
  readonly log?:
    | { info(obj: object, message: string): void; error(obj: object, message: string): void }
    | undefined;
}) {
  let market: CityShareMarket | undefined;
  let loading: Promise<CityShareMarket | undefined> | undefined;
  let chain: Promise<unknown> = Promise.resolve();
  /** 명령·회차를 한 줄로 세운다 */
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = chain.then(work, work);
    chain = next.catch(() => undefined);
    return next;
  };

  /** 세계가 준비됐으면 시장을 만든다(한 번 — DB에서 걸린 주문을 읽는다) */
  const ensure = (): Promise<CityShareMarket | undefined> => {
    if (market) return Promise.resolve(market);
    if (!o.port.ready()) return Promise.resolve(undefined);
    loading ??= (async () => {
      const ledger = o.port.ledger();
      const writer = o.port.writer();
      const pool = o.port.pool();
      if (!ledger || !writer || !pool) return undefined;
      const loaded = await loadCityShares(pool, o.now());
      market = createCityShareMarket({
        ledger,
        writer,
        planetId: TEST_PLANET_ID,
        loaded,
        currencyOf: (cityId) => o.port.currencyOf(cityId),
        rules: o.rules,
        now: o.now,
      });
      return market;
    })().finally(() => {
      loading = undefined;
    });
    return loading;
  };

  /** 내 계정·내가 이끄는 가문(가문장만 — 의결 표 headOf) */
  const actorsOf = async (userId: string): Promise<CityShareActors> => {
    const owner = o.port.ownerOfUser(userId);
    const member = o.port.houseOfUser(userId);
    const head = member === undefined ? undefined : await o.governance()?.store.headOf(member);
    const row = head === userId ? member : undefined;
    const houseKey: HouseKey | undefined = row === undefined ? undefined : `p:${row}`;
    return {
      me: owner === undefined ? undefined : ownerHolder(owner),
      house: houseKey === undefined ? undefined : houseHolder(houseTailOf(houseKey)),
      houseKey,
    };
  };

  /** 그 도시가 독재 나라 도시면 지배 쪽(없으면 undefined — 독재가 아니거나 지배 가문이 비었다) */
  const rulingOf = async (cityId: number): Promise<RulingSides | undefined> => {
    const g = o.governance();
    const nation = g?.port.nations().find((row) => row.cities.includes(cityId));
    if (!g || !nation || nation.regime !== "dictatorship") return undefined;
    const state = (await g.store.states()).get(nation.rowId);
    const ruling = await g.service.tools.ruling(nation, state);
    if (ruling.key === null || !isHouseKey(ruling.key)) return undefined;
    const sides = new Set<string>([houseHolder(houseTailOf(ruling.key))]);
    const parsed = parseHouseKey(ruling.key);
    const houseOwner = parsed && !parsed.npc ? g.port.ownerOfHouseRow(parsed.id) : undefined;
    if (houseOwner !== undefined && houseOwner !== nation.ownerId) sides.add(ownerHolder(houseOwner));
    return { nation, sides, treasury: ownerHolder(nation.ownerId), key: ruling.key };
  };

  /** 지배 쪽 지분·국고 지분·걸린 팔 주문(그 나라 모든 도시) → 과반 끝 */
  const capsOf = (m: CityShareMarket, r: RulingSides, pending: boolean) => {
    const ledger = o.port.ledger();
    if (!ledger) return undefined;
    let total = 0n;
    let treasury = 0n;
    let own = 0n;
    let pendingRuling = 0n;
    let pendingTreasury = 0n;
    for (const cityId of r.nation.cities) {
      total += totalShares(ledger, cityId);
      treasury += holdingsOf(ledger, cityId).find((row) => row.owner === r.nation.ownerId)?.amount ?? 0n;
      for (const side of r.sides) own += m.shareBalance(side, cityId);
      if (!pending) continue;
      for (const order of m.orders(cityId)) {
        if (order.side !== "sell") continue;
        if (r.sides.has(order.holder)) pendingRuling += order.shares;
        else if (order.holder === r.treasury) pendingTreasury += order.shares;
      }
    }
    return majorityCaps({ total, own, others: total - treasury, pendingRuling, pendingTreasury });
  };

  /** 주문 때의 과반 끝(그 쪽이 지배 쪽·국고가 아니면 undefined = 끝 없음) */
  const placeCap = async (
    m: CityShareMarket,
    holder: string,
    cityId: number,
  ): Promise<bigint | undefined> => {
    const r = await rulingOf(cityId);
    if (!r || (!r.sides.has(holder) && holder !== r.treasury)) return undefined;
    const caps = capsOf(m, r, true);
    if (!caps) return undefined;
    return r.sides.has(holder) ? caps.ruling : caps.treasury;
  };

  const done = async (result: CityShareResult): Promise<CityShareResult> => {
    if (result.ok) await o.port.writer()?.durable();
    return result;
  };

  const place = (
    userId: string,
    input: {
      readonly cityId: number;
      readonly side: CityShareSide;
      readonly price: bigint;
      readonly shares: bigint;
      readonly asHouse: boolean;
    },
  ): Promise<CityShareResult> =>
    serial(async () => {
      const m = await ensure();
      if (!m) return fail("busy");
      const actors = await actorsOf(userId);
      const holder = input.asHouse ? actors.house : actors.me;
      if (input.asHouse && holder === undefined) return fail("not_house_head");
      if (holder === undefined)
        return input.side === "buy" ? fail("insufficient_funds") : fail("insufficient_shares");
      const cap = input.side === "sell" ? await placeCap(m, holder, input.cityId) : undefined;
      const result = m.place({ holder, ...input, atMs: o.now(), cap });
      if (result.ok)
        o.log?.info(
          { userId, cityId: input.cityId, side: input.side, orderId: result.orderId },
          "city share order",
        );
      return done(result.ok ? { ok: true, orderId: result.orderId } : fail(result.code));
    });

  const cancel = (userId: string, orderId: number): Promise<CityShareResult> =>
    serial(async () => {
      const m = await ensure();
      if (!m) return fail("busy");
      const actors = await actorsOf(userId);
      const holders = [actors.me, actors.house].flatMap((holder) => (holder === undefined ? [] : [holder]));
      const result = m.cancel(holders, orderId, o.now());
      return done(result.ok ? { ok: true } : fail(result.code));
    });

  /** 승인된 국고 지분 팔기(governance approvedShareSale 고리 — 질문 2438 답 D-583): 국고가 승인 수를 가장 낮은 값에 건다(과반·가진 주까지) */
  const approvedSale = (sale: ApprovedShareSale, nowMs: number): Promise<void> =>
    serial(async () => {
      const m = await ensure();
      const nation = o.governance()?.port.nation(sale.nationRowId);
      if (!m || !nation) {
        o.log?.error({ agendaId: sale.agendaId }, "city share: approved sale not placed (market not ready)");
        return;
      }
      const holder = ownerHolder(nation.ownerId);
      const cap = await placeCap(m, holder, sale.cityId);
      let shares = m.sellable(holder, sale.cityId);
      if (sale.shares < shares) shares = sale.shares;
      if (cap !== undefined && cap < shares) shares = cap;
      if (shares <= 0n) {
        o.log?.info(
          { agendaId: sale.agendaId, cityId: sale.cityId },
          "city share: approved sale has no sellable shares",
        );
        return;
      }
      const result = m.place({
        holder,
        cityId: sale.cityId,
        side: "sell",
        price: sale.minPrice > 0n ? sale.minPrice : 1n,
        shares,
        atMs: nowMs,
        agendaId: sale.agendaId,
      });
      o.log?.info(
        { agendaId: sale.agendaId, cityId: sale.cityId, shares: String(shares), result },
        "city share: approved sale",
      );
      await o.port.writer()?.durable();
    });

  /** 회차: 경계를 지났으면 독재 도시 과반 끝(나라마다 한 예산을 도시 차례로 나눔)을 셈하고 모든 도시를 체결한다 */
  const tick = (): Promise<number> =>
    serial(async () => {
      const m = await ensure();
      if (!m) return 0;
      const boundary = m.due(o.now());
      if (boundary === undefined) return 0;
      const budgets = new Map<number, { ruling: bigint; treasury: bigint; sides: RulingSides }>();
      for (const cityId of m.cities()) {
        const r = await rulingOf(cityId);
        if (!r || budgets.has(r.nation.rowId)) continue;
        // 회차 끝: 걸린 팔 주문이 바로 이번에 팔 몫이라 뺀 셈 없이(pending = false) 끝을 낸다
        const caps = capsOf(m, r, false);
        if (caps) budgets.set(r.nation.rowId, { ruling: caps.ruling, treasury: caps.treasury, sides: r });
      }
      const capsFor = (cityId: number): CityShareCaps => {
        const out = new Map<string, bigint>();
        for (const budget of budgets.values()) {
          if (!budget.sides.nation.cities.includes(cityId)) continue;
          for (const order of m.orders(cityId)) {
            if (order.side !== "sell") continue;
            const ruling = budget.sides.sides.has(order.holder);
            if (!ruling && order.holder !== budget.sides.treasury) continue;
            const left = ruling ? budget.ruling : budget.treasury;
            const take = order.shares < left ? order.shares : left;
            out.set(order.holder, (out.get(order.holder) ?? 0n) + take);
            if (ruling) budget.ruling -= take;
            else budget.treasury -= take;
          }
        }
        return out;
      };
      const ran = m.run(boundary, capsFor);
      if (ran > 0) o.log?.info({ boundary, cities: ran }, "city share round");
      return ran;
    });

  return {
    ensure,
    actorsOf,
    rulingOf,
    placeCap,
    place,
    cancel,
    approvedSale,
    tick: () =>
      tick().catch((error: unknown) => {
        o.log?.error({ err: error }, "city share round failed");
        return 0;
      }),
    market: (): CityShareMarket | undefined => market,
    /** 그 나라 도시들의 가문·주체 주주(view.ts) */
    holdersOf(cityId: number) {
      const ledger = o.port.ledger();
      if (!ledger) return { owners: [], houses: [] };
      return { owners: holdingsOf(ledger, cityId), houses: houseHoldingsOf(ledger, cityId) };
    },
  };
}

export type CityShareService = ReturnType<typeof createCityShareService>;
