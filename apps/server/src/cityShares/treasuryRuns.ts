// 국고 지분 안건 집행 기간·재투표(줄기 gov-fix-4) — 사용자 결정 D-591(질문 2526 "돈이없으면 못사는거고 취득량만 정하는거다. 통과된안건은 주-월 단위 기간이 있고
// 실행되지못하면 취소할지 계속할지 재투표"), docs/adr/2026-11-21-share-market-2.md "바뀜 (gov-fix-4, D-591)".
// - 승인된 국고 지분 사기(D-587 2479 나)는 수량만 정한다. 안건을 열 때 국고 돈을 보지 않고(shareAgendas.ts), 승인 때 줄이지 않는다. 승인되면 집행(표 treasury_share_runs)을
//   열고 기간(설정 칸 gov_share_exec_ms — 7~30일, 기술 기본값 14일 [임시]) 동안 회차마다 "정한 수량 − 체결한 주 − 걸려 있는 주"만큼 국고 돈이 묶일 수 있는 데까지 사기 주문을
//   더 건다(돈이 없으면 그 회차는 사지 않는다).
// - 국고 지분 팔기(D-583 2438)도 같은 꼴로 바꿨다(같은 승인 → 국고 주문 길이라): 회차마다 국고가 가진 주(독재 과반 끝 안)만큼 팔 주문을 더 건다. 팔기 안건을 열 때 국고가 가진
//   주를 보는 것은 그대로다(사기의 돈 검사만 사용자 답으로 뺐다 — 팔기 쪽은 질문 2667).
// - 다 채우면 filled. 기간이 끝나도 남으면 걸린 주문을 거두고(묶은 돈을 돌려준다) expired로 적은 뒤, 같은 종류 안건을 남은 수량으로 다시 연다(재투표 — payload renewOf =
//   옛 안건, 제안한 쪽 없음). 가결되면 새 집행(새 기간)이 열리고, 부결이면 거기서 끝(취소). 독재 나라는 열린 안건을 의결 틱이 취소하므로 재투표를 열지 않고 끝낸다 —
//   지도자가 직권으로 다시 낼 수 있다 [임시 2668].
// - 지도자가 국고 주문을 거두면(city_share_cancel — 2473 다) 그 집행도 끝난다(cancelled — 다음 회차에 다시 걸지 않는다).
// - 체결은 시장 고리(market.ts onFill)로 센다. 쓰기는 DB 바로(회차·명령은 서비스 한 줄 안에서 돈다).
import type { AgendaKind } from "@terra/shared/governance";
import type { GovernanceNation } from "../governance/port.ts";
import type { GovernanceRules } from "../governance/rules.ts";
import type { GovernanceStore } from "../governance/store.ts";
import type { CityShareMarket, CityShareOrder, CityShareSide } from "./market.ts";
import { ownerHolder } from "./market.ts";

type RunState = "active" | "filled" | "expired" | "cancelled";

/** 집행 한 줄 */
export interface TreasuryRun {
  readonly agendaId: number;
  readonly nationId: number;
  readonly side: CityShareSide;
  readonly cityId: number;
  readonly target: bigint;
  readonly price: bigint;
  done: bigint;
  readonly startedAtMs: number;
  readonly endsAtMs: number;
  state: RunState;
  revoteAgendaId: number | null;
}

/** 집행이 읽는 의결 몫(GovernanceAttached가 맞는다) */
export interface TreasuryGovernance {
  readonly port: {
    nation(rowId: number): Pick<GovernanceNation, "rowId" | "ownerId" | "regime"> | undefined;
  };
  readonly store: {
    insertAgenda(input: Parameters<GovernanceStore["insertAgenda"]>[0]): Promise<{ readonly id: number }>;
  };
  rules(): Pick<GovernanceRules, "shareExecMs" | "periodOf">;
}

type Pool = { query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };

export interface TreasuryRunDeps {
  readonly pool: () => Pool | undefined;
  readonly governance: () => TreasuryGovernance | undefined;
  /** 그 도시의 지금 값 화폐(없는 도시면 undefined — 그 회차는 걸지 않는다) */
  readonly currencyOf: (cityId: number) => string | undefined;
  /** 국고 팔기의 독재 과반 끝(없으면 끝 없음 — service.ts placeCap) */
  readonly sellCap: (market: CityShareMarket, holder: string, cityId: number) => Promise<bigint | undefined>;
  readonly log?:
    | { info(obj: object, message: string): void; error(obj: object, message: string): void }
    | undefined;
}

const big = (value: unknown): bigint =>
  typeof value === "bigint"
    ? value
    : typeof value === "string" || typeof value === "number"
      ? BigInt(value)
      : 0n;
const STATES: readonly RunState[] = ["active", "filled", "expired", "cancelled"];

/** 남은 수량(정한 수량 − 체결한 주, 0 아래는 0) */
export const runRemaining = (run: Pick<TreasuryRun, "target" | "done">): bigint =>
  run.target > run.done ? run.target - run.done : 0n;

/**
 * 이번 회차에 더 걸 주 수: 남은 수량 − 걸려 있는 주를 사기는 국고 돈 ÷ 값까지, 팔기는 팔 수 있는 주(과반 끝 안)까지. 0 아래는 0
 */
export function topUpShares(
  run: Pick<TreasuryRun, "target" | "done" | "side" | "price">,
  open: bigint,
  available: bigint,
): bigint {
  const want = runRemaining(run) - open;
  if (want <= 0n || available <= 0n) return 0n;
  return want < available ? want : available;
}

export function createTreasuryRuns(d: TreasuryRunDeps) {
  const runs = new Map<number, TreasuryRun>();
  let loaded = false;
  const dirty = new Set<number>();

  const ensure = async (): Promise<void> => {
    if (loaded) return;
    const pool = d.pool();
    if (!pool) return;
    const { rows } = await pool.query(
      `select agenda_id, nation_id, side, city_id, target, price, done, started_at_ms, ends_at_ms, state, revote_agenda_id
         from treasury_share_runs where state = 'active'`,
    );
    for (const row of rows) {
      const run: TreasuryRun = {
        agendaId: Number(row.agenda_id),
        nationId: Number(row.nation_id),
        side: row.side === "sell" ? "sell" : "buy",
        cityId: Number(row.city_id),
        target: big(row.target),
        price: big(row.price),
        done: big(row.done),
        startedAtMs: Number(row.started_at_ms),
        endsAtMs: Number(row.ends_at_ms),
        state: STATES.find((state) => state === row.state) ?? "active",
        revoteAgendaId: row.revote_agenda_id === null ? null : Number(row.revote_agenda_id),
      };
      runs.set(run.agendaId, run);
    }
    loaded = true;
  };

  const save = async (run: TreasuryRun): Promise<void> => {
    const pool = d.pool();
    if (!pool) return;
    await pool.query(
      `insert into treasury_share_runs (agenda_id, nation_id, side, city_id, target, price, done, started_at_ms, ends_at_ms, state, revote_agenda_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (agenda_id) do update set done = excluded.done, state = excluded.state, revote_agenda_id = excluded.revote_agenda_id`,
      [
        run.agendaId,
        run.nationId,
        run.side,
        run.cityId,
        run.target.toString(),
        run.price.toString(),
        run.done.toString(),
        run.startedAtMs,
        run.endsAtMs,
        run.state,
        run.revoteAgendaId,
      ],
    );
    dirty.delete(run.agendaId);
    if (run.state !== "active") runs.delete(run.agendaId);
  };

  /** 그 집행의 걸린 주문(국고 holder·agendaId) */
  const openOrders = (market: CityShareMarket, run: TreasuryRun, holder: string): CityShareOrder[] =>
    market.orders(run.cityId).filter((order) => order.agendaId === run.agendaId && order.holder === holder);

  /** 회차마다 모자란 만큼 국고 주문을 더 건다(돈·주가 있는 데까지) */
  const topUp = async (market: CityShareMarket, run: TreasuryRun, nowMs: number): Promise<void> => {
    const nation = d.governance()?.port.nation(run.nationId);
    const asset = d.currencyOf(run.cityId);
    if (!nation || asset === undefined) return;
    const holder = ownerHolder(nation.ownerId);
    const open = openOrders(market, run, holder).reduce((sum, order) => sum + order.shares, 0n);
    let available: bigint;
    if (run.side === "buy") available = market.cashBalance(holder, asset) / run.price;
    else {
      available = market.sellable(holder, run.cityId);
      const cap = await d.sellCap(market, holder, run.cityId);
      if (cap !== undefined && cap < available) available = cap;
    }
    const shares = topUpShares(run, open, available);
    if (shares <= 0n) return;
    const result = market.place({
      holder,
      cityId: run.cityId,
      side: run.side,
      price: run.price,
      shares,
      atMs: nowMs,
      agendaId: run.agendaId,
    });
    d.log?.info(
      { agendaId: run.agendaId, side: run.side, shares: String(shares), result },
      "treasury share run: order",
    );
  };

  /** 기간이 끝났다: 걸린 주문을 거두고 남은 수량으로 재투표를 연다(독재는 열지 않는다) */
  const expire = async (market: CityShareMarket, run: TreasuryRun, nowMs: number): Promise<void> => {
    const gov = d.governance();
    const nation = gov?.port.nation(run.nationId);
    if (nation) {
      const holder = ownerHolder(nation.ownerId);
      for (const order of openOrders(market, run, holder)) market.cancel([holder], order.id, nowMs);
    }
    run.state = "expired";
    const left = runRemaining(run);
    if (gov && nation && nation.regime !== "dictatorship" && left > 0n) {
      const kind: AgendaKind = run.side === "buy" ? "treasury_share_buy" : "treasury_share_sale";
      const agenda = await gov.store.insertAgenda({
        nationId: nation.rowId,
        kind,
        regime: nation.regime,
        proposerKey: null,
        proposerUser: null,
        payload: {
          cityId: run.cityId,
          shares: left.toString(),
          ...(run.side === "buy" ? { maxPrice: run.price.toString() } : { minPrice: run.price.toString() }),
          renewOf: run.agendaId,
        },
        openedAtMs: nowMs,
        registerUntilMs: null,
        closesAtMs: nowMs + gov.rules().periodOf(kind),
      });
      run.revoteAgendaId = agenda.id;
    }
    await save(run);
    d.log?.info(
      { agendaId: run.agendaId, left: String(left), revote: run.revoteAgendaId },
      "treasury share run: expired",
    );
  };

  return {
    /** 승인된 안건으로 집행을 연다(기간 = 설정 칸 gov_share_exec_ms) — 바로 한 번 건다 */
    async start(
      market: CityShareMarket,
      input: {
        readonly agendaId: number;
        readonly nationId: number;
        readonly side: CityShareSide;
        readonly cityId: number;
        readonly target: bigint;
        readonly price: bigint;
      },
      nowMs: number,
    ): Promise<void> {
      await ensure();
      if (runs.has(input.agendaId) || input.target <= 0n || input.price <= 0n) return;
      const execMs = d.governance()?.rules().shareExecMs ?? 14 * 86_400_000;
      const run: TreasuryRun = {
        ...input,
        done: 0n,
        startedAtMs: nowMs,
        endsAtMs: nowMs + execMs,
        state: "active",
        revoteAgendaId: null,
      };
      runs.set(run.agendaId, run);
      await save(run);
      await topUp(market, run, nowMs);
    },
    /** 회차 전: 기간이 끝난 집행은 끝내고(재투표), 나머지는 모자란 만큼 더 건다 */
    async beforeRound(market: CityShareMarket, nowMs: number): Promise<void> {
      await ensure();
      // 끝난 집행은 save가 표에서 지운다(Map은 돌면서 지워도 남은 것을 그대로 돈다)
      for (const run of runs.values()) {
        if (run.state !== "active") continue;
        if (runRemaining(run) <= 0n) {
          run.state = "filled";
          await save(run);
        } else if (nowMs >= run.endsAtMs) await expire(market, run, nowMs);
        else await topUp(market, run, nowMs);
      }
    },
    /** 체결 고리(market.ts onFill): 그 안건의 집행이면 체결 주를 더한다 */
    filled(order: CityShareOrder, shares: bigint): void {
      if (order.agendaId === null) return;
      const run = runs.get(order.agendaId);
      if (!run || run.state !== "active") return;
      run.done += shares;
      dirty.add(run.agendaId);
    },
    /** 회차 뒤: 체결이 바뀐 집행을 쓴다(다 채웠으면 filled) */
    async afterRound(): Promise<void> {
      for (const agendaId of dirty) {
        const run = runs.get(agendaId);
        if (!run) {
          dirty.delete(agendaId);
          continue;
        }
        if (runRemaining(run) <= 0n) run.state = "filled";
        await save(run);
      }
    },
    /** 지도자가 국고 주문을 거뒀다: 그 집행을 끝낸다(다음 회차에 다시 걸지 않는다) */
    async cancelled(agendaId: number | null): Promise<void> {
      if (agendaId === null) return;
      await ensure();
      const run = runs.get(agendaId);
      if (!run || run.state !== "active") return;
      run.state = "cancelled";
      await save(run);
    },
    /** 진행 중 집행(조회·시험) */
    active: (): readonly TreasuryRun[] => [...runs.values()].filter((run) => run.state === "active"),
  };
}

export type TreasuryRuns = ReturnType<typeof createTreasuryRuns>;
