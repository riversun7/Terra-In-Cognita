// 사업장 장부 코어(서버 권위) — 기획 D-548(사업장 수입은 주인 지갑이 아니라 사업장에 기록된다)·D-555(질문 1501~1514 답),
// docs/adr/2026-11-15-business-ledger.md. 계정 꼴·장부 칸·지분 나누기는 @terra/shared/businessBooks.
// - 금고 = (건물 주인, 화폐, 건물 위치). 원장 코어·표를 바꾸지 않는다(주체 계정이라 0 아래로 내려가지 않는다).
// - 수입(receive): 낸 쪽 → 금고(거래 하나, 종류 = 수입 종류), 곧이어 소득세(business_tax, 금고 → 그 도시 나라 국고 — 1503 "들어올 때").
//   건물 주인이 그 도시 주인이면(NPC 제 도시 건물) 세금은 같은 주머니라 없다. 제 시설을 써도 요금을 낸다(1514 — 금고로, 454 소각을 대신한다).
// - 적자(1504): 임금 보증금·채우기 등 금고가 모자라면 시스템 계정 debt:business:<건물>:<화폐>가 모자란 만큼 금고에 미리 넣는다(business_debt,
//   계정 잔고가 음수 = 갚을 돈). 정산 주기 끝에 금고에서 먼저 갚는다(business_repay). 한 주기 넘게 못 갚으면 사업장이 멈춘다(시설이 일하지 않음),
//   다 갚으면 다시 돈다. 주인이 넣으면(business_invest) 바로 갚는다.
// - 정산(1501·1502): 손으로(주인·대주주) 또는 주기 끝 자동. 적자를 먼저 갚고 남은 금고 돈을 지분 수대로 주주 지갑(위치 없음)에 나눈다
//   (business_settle). 지분 = 주인 하나 1주 [임시](질문 1621). NPC 세력 사업장의 주주 = 그 세력 → 몫은 나라 국고로(1509·1510 — 플레이어와 같다).
// - 쓰기는 월드 쓰기 대기열(원장 고리와 같은 묶음). 거래에 중복 방지 키를 달지 않는다(자동 정산 주기는 business_states.settled_at_ms로 한 번만).
import {
  type ShareHolder,
  businessDebtCode,
  businessLocation,
  incomeTaxOf,
  majorHolders,
  parseBusinessDebtCode,
  settleBoundary,
  splitByShares,
} from "@terra/shared/businessBooks";
import type { BusinessCoefficients } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { LoadedBusiness } from "./store.ts";

/** 사업장 하나의 상태 줄(business_states) */
export interface BusinessState {
  readonly buildingId: number;
  /** 갚지 않은 적자가 처음 생긴 시각(없으면 null) */
  debtSinceMs: number | null;
  /** 적자를 한 주기 넘게 못 갚아 멈춘 시각(돌면 null) */
  suspendedAtMs: number | null;
  /** 마지막 자동 정산 주기 시작(없으면 null) */
  settledAtMs: number | null;
}

/** 사업장 창고 판매 값 한 줄(business_prices, 1개 값 — 화폐 최소 단위) */
export interface BusinessPrice {
  readonly buildingId: number;
  readonly item: string;
  price: bigint;
}

export const EMPTY_BUSINESS: LoadedBusiness = { states: [], prices: [] };

/** 사업장 자리(건물 서비스가 채운다) */
export interface BusinessPlace {
  readonly ownerId: number | null;
  readonly cityId: number | null;
}

export interface BusinessDeps {
  readonly ledger: Ledger;
  readonly writer: WorldWriter;
  readonly planetId: string;
  readonly loaded: LoadedBusiness;
  /** 건물 주인·도시(건물이 없으면 undefined) */
  place(buildingId: number): BusinessPlace | undefined;
  /** 사업장(시설 줄이 있는 건물) ID 목록 — 자동 정산이 돈다 */
  businesses(): Iterable<number>;
  /** 그 도시의 국고 주인·소득세 만분율(도시·나라를 모르면 undefined → 세금 없음) */
  tax(cityId: number): { readonly treasuryOwner: number; readonly bp: number } | undefined;
  readonly rules: () => BusinessCoefficients;
}

export interface IncomeInput {
  /** 낸 쪽 계정(주체 계정) */
  readonly from: number;
  readonly buildingId: number;
  readonly asset: string;
  readonly amount: bigint;
  readonly kind: string;
  readonly atMs: number;
}

export interface BusinessCore {
  /** 금고 계정(없으면 만든다) */
  vault(ownerId: number, asset: string, buildingId: number): number;
  /** 금고 잔고(건물 주인, 화폐마다) */
  vaultBalances(buildingId: number): Map<string, bigint>;
  /**
   * 수입: from → 그 건물 주인 금고, 그리고 소득세. 주인 없는 건물이면 false(부르는 쪽이 옛 길 — 소각 등 — 을 쓴다). 금액이 0 이하면 아무것도 하지
   * 않고 true. from 잔고가 모자라면 LedgerError(부르는 쪽이 미리 확인한다)
   */
  receive(input: IncomeInput): boolean;
  /** 이미 금고에 든 수입의 소득세(공용 함수가 넣은 임대료 등). 낸 세금 */
  taxIncome(buildingId: number, ownerId: number, asset: string, gross: bigint, atMs: number): bigint;
  /** 금고가 needed보다 모자라면 모자란 만큼 적자로 미리 넣는다(1504). 미리 넣은 양 */
  advance(buildingId: number, ownerId: number, asset: string, needed: bigint, atMs: number): bigint;
  /** 갚을 돈(화폐마다 양수) */
  debts(buildingId: number): Map<string, bigint>;
  /** 금고에서 적자를 갚는다(있는 만큼). 남은 적자 합 */
  repay(buildingId: number, atMs: number): bigint;
  /** 주인 지갑 → 금고(넣기), 곧 적자를 갚는다. 지갑이 모자라면 false */
  invest(buildingId: number, ownerId: number, asset: string, amount: bigint, atMs: number): boolean;
  /**
   * 정산: 적자를 갚은 뒤 그 화폐 금고 돈(amount가 있으면 그만큼까지)을 지분 수대로 주주 지갑에 나눈다. 나눈 양(화폐마다)
   */
  settle(buildingId: number, atMs: number, only?: { asset: string; amount: bigint }): Map<string, bigint>;
  /** 주주(지금은 주인 하나 1주 [임시]) */
  holders(buildingId: number): ShareHolder[];
  /** 정산할 수 있는 사람인가(주인·대주주, 1502) */
  mayManage(buildingId: number, ownerId: number): boolean;
  /** 멈췄나(적자를 한 주기 넘게 못 갚음) */
  suspended(buildingId: number): boolean;
  state(buildingId: number): Readonly<BusinessState> | undefined;
  /** 주기 끝 처리: 적자 갚기·멈춤 판단·자동 정산(주기마다 사업장 하나 한 번). 처리한 사업장 수 */
  tick(nowMs: number): number;
  /** 다음 자동 정산 시각(끔이면 null) */
  nextSettleMs(nowMs: number): number | null;
  /** 판매 값(정한 값, 없으면 undefined) */
  price(buildingId: number, item: string): bigint | undefined;
  setPrice(buildingId: number, item: string, price: bigint): void;
  /** 사라진 건물의 상태·값 줄을 지운다 */
  forget(buildingId: number): void;
  /** 메모리 불변 조건: 적자 계정은 0 이하 */
  check(): string[];
}

export function createBusinessCore(deps: BusinessDeps): BusinessCore {
  const { ledger, writer } = deps;
  const states = new Map<number, BusinessState>(
    deps.loaded.states.map((row) => [row.buildingId, { ...row }]),
  );
  const prices = new Map<string, BusinessPrice>(
    deps.loaded.prices.map((row) => [`${row.buildingId}|${row.item}`, { ...row }]),
  );

  const stateOf = (buildingId: number): BusinessState => {
    let found = states.get(buildingId);
    if (!found) {
      found = { buildingId, debtSinceMs: null, suspendedAtMs: null, settledAtMs: null };
      states.set(buildingId, found);
    }
    return found;
  };
  const saveState = (state: BusinessState): void =>
    writer.upsert("businessStates", {
      building_id: state.buildingId,
      planet_id: deps.planetId,
      debt_since_ms: state.debtSinceMs,
      suspended_at_ms: state.suspendedAtMs,
      settled_at_ms: state.settledAtMs,
    });

  const vault = (ownerId: number, asset: string, buildingId: number): number =>
    ledger.ownerAccount(ownerId, asset, businessLocation(buildingId));
  const isMoney = (asset: string): boolean => !asset.startsWith("item:");

  const vaultBalances = (buildingId: number): Map<string, bigint> => {
    const out = new Map<string, bigint>();
    const ownerId = deps.place(buildingId)?.ownerId ?? null;
    if (ownerId === null) return out;
    const here = businessLocation(buildingId);
    for (const account of ledger.accounts())
      if (
        account.ownerId === ownerId &&
        account.location === here &&
        isMoney(account.asset) &&
        account.balance > 0n
      )
        out.set(account.asset, account.balance);
    return out;
  };

  const taxIncome = (
    buildingId: number,
    ownerId: number,
    asset: string,
    gross: bigint,
    atMs: number,
  ): bigint => {
    const cityId = deps.place(buildingId)?.cityId ?? null;
    if (cityId === null || gross <= 0n) return 0n;
    const tax = deps.tax(cityId);
    if (!tax || tax.treasuryOwner === ownerId) return 0n;
    const from = vault(ownerId, asset, buildingId);
    const due = incomeTaxOf(gross, tax.bp);
    const have = ledger.balance(from);
    const pay = have < due ? have : due;
    if (pay <= 0n) return 0n;
    ledger.post({
      kind: "business_tax",
      atMs,
      entries: [
        { account: from, amount: -pay },
        { account: ledger.ownerAccount(tax.treasuryOwner, asset), amount: pay },
      ],
    });
    return pay;
  };

  const receive = (input: IncomeInput): boolean => {
    const ownerId = deps.place(input.buildingId)?.ownerId ?? null;
    if (ownerId === null) return false;
    if (input.amount <= 0n) return true;
    ledger.post({
      kind: input.kind,
      atMs: input.atMs,
      entries: [
        { account: input.from, amount: -input.amount },
        { account: vault(ownerId, input.asset, input.buildingId), amount: input.amount },
      ],
    });
    taxIncome(input.buildingId, ownerId, input.asset, input.amount, input.atMs);
    return true;
  };

  const debtAccount = (buildingId: number, asset: string): number =>
    ledger.systemAccount(businessDebtCode(buildingId, asset), asset);

  const debts = (buildingId: number): Map<string, bigint> => {
    const out = new Map<string, bigint>();
    for (const account of ledger.accounts()) {
      if (account.systemCode === null || account.balance >= 0n) continue;
      const parsed = parseBusinessDebtCode(account.systemCode);
      if (parsed && parsed.buildingId === buildingId) out.set(parsed.asset, -account.balance);
    }
    return out;
  };

  const advance = (
    buildingId: number,
    ownerId: number,
    asset: string,
    needed: bigint,
    atMs: number,
  ): bigint => {
    const account = vault(ownerId, asset, buildingId);
    const short = needed - ledger.balance(account);
    if (short <= 0n) return 0n;
    ledger.post({
      kind: "business_debt",
      atMs,
      entries: [
        { account: debtAccount(buildingId, asset), amount: -short },
        { account, amount: short },
      ],
    });
    const state = stateOf(buildingId);
    if (state.debtSinceMs === null) {
      state.debtSinceMs = atMs;
      saveState(state);
    }
    return short;
  };

  const repay = (buildingId: number, atMs: number): bigint => {
    const ownerId = deps.place(buildingId)?.ownerId ?? null;
    let left = 0n;
    for (const [asset, owed] of [...debts(buildingId)].toSorted((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const from = ownerId === null ? undefined : vault(ownerId, asset, buildingId);
      const have = from === undefined ? 0n : ledger.balance(from);
      const pay = have < owed ? have : owed;
      if (pay > 0n && from !== undefined)
        ledger.post({
          kind: "business_repay",
          atMs,
          entries: [
            { account: from, amount: -pay },
            { account: debtAccount(buildingId, asset), amount: pay },
          ],
        });
      left += owed - pay;
    }
    const state = states.get(buildingId);
    if (left === 0n && state && (state.debtSinceMs !== null || state.suspendedAtMs !== null)) {
      state.debtSinceMs = null;
      state.suspendedAtMs = null;
      saveState(state);
    }
    return left;
  };

  const invest = (
    buildingId: number,
    ownerId: number,
    asset: string,
    amount: bigint,
    atMs: number,
  ): boolean => {
    if (amount <= 0n) return false;
    const wallet = ledger.ownerAccount(ownerId, asset);
    if (ledger.balance(wallet) < amount) return false;
    ledger.post({
      kind: "business_invest",
      atMs,
      entries: [
        { account: wallet, amount: -amount },
        { account: vault(ownerId, asset, buildingId), amount },
      ],
    });
    repay(buildingId, atMs);
    return true;
  };

  const holders = (buildingId: number): ShareHolder[] => {
    const ownerId = deps.place(buildingId)?.ownerId ?? null;
    return ownerId === null ? [] : [{ ownerId, shares: 1n }];
  };

  const settle = (
    buildingId: number,
    atMs: number,
    only?: { asset: string; amount: bigint },
  ): Map<string, bigint> => {
    const paid = new Map<string, bigint>();
    const ownerId = deps.place(buildingId)?.ownerId ?? null;
    if (ownerId === null) return paid;
    repay(buildingId, atMs);
    const owners = holders(buildingId);
    for (const [asset, balance] of [...vaultBalances(buildingId)].toSorted((a, b) =>
      a[0] < b[0] ? -1 : 1,
    )) {
      if (only && only.asset !== asset) continue;
      // 갚지 못한 적자가 남은 화폐는 나누지 않는다(갚을 돈이 먼저)
      if ((debts(buildingId).get(asset) ?? 0n) > 0n) continue;
      const amount = only && only.amount > 0n && only.amount < balance ? only.amount : balance;
      const split = splitByShares(amount, owners);
      if (split.size === 0) continue;
      const entries = [{ account: vault(ownerId, asset, buildingId), amount: -amount }];
      for (const [holder, part] of [...split].toSorted((a, b) => a[0] - b[0]))
        if (part > 0n) entries.push({ account: ledger.ownerAccount(holder, asset), amount: part });
      ledger.post({ kind: "business_settle", atMs, entries });
      paid.set(asset, amount);
    }
    return paid;
  };

  const tick = (nowMs: number): number => {
    const period = Math.max(0, Math.floor(deps.rules().settlePeriodMs));
    const boundary = settleBoundary(nowMs, period);
    if (boundary === undefined) return 0;
    let done = 0;
    for (const buildingId of [...deps.businesses()].toSorted((a, b) => a - b)) {
      const place = deps.place(buildingId);
      if (!place || place.ownerId === null) continue;
      const state = states.get(buildingId);
      if (state?.settledAtMs !== undefined && state.settledAtMs !== null && state.settledAtMs >= boundary)
        continue;
      const left = repay(buildingId, boundary);
      const current = stateOf(buildingId);
      // 한 주기 넘게 못 갚은 적자 → 멈춤(1504)
      if (left > 0n && current.debtSinceMs !== null && current.debtSinceMs < boundary - period) {
        if (current.suspendedAtMs === null) current.suspendedAtMs = boundary;
      }
      if (left === 0n) settle(buildingId, boundary);
      current.settledAtMs = boundary;
      saveState(current);
      done += 1;
    }
    return done;
  };

  return {
    vault,
    vaultBalances,
    receive,
    taxIncome,
    advance,
    debts,
    repay,
    invest,
    settle,
    holders,
    mayManage: (buildingId, ownerId) => majorHolders(holders(buildingId)).includes(ownerId),
    suspended: (buildingId) => (states.get(buildingId)?.suspendedAtMs ?? null) !== null,
    state: (buildingId) => states.get(buildingId),
    tick,
    nextSettleMs(nowMs) {
      const period = Math.max(0, Math.floor(deps.rules().settlePeriodMs));
      const boundary = settleBoundary(nowMs, period);
      return boundary === undefined ? null : boundary + period;
    },
    price: (buildingId, item) => prices.get(`${buildingId}|${item}`)?.price,
    setPrice(buildingId, item, price) {
      const key = `${buildingId}|${item}`;
      const row = prices.get(key) ?? { buildingId, item, price };
      row.price = price;
      prices.set(key, row);
      writer.upsert("businessPrices", {
        building_id: buildingId,
        item,
        planet_id: deps.planetId,
        price,
      });
    },
    forget(buildingId) {
      if (states.delete(buildingId)) writer.remove("businessStates", { building_id: buildingId });
      for (const [key, row] of prices)
        if (row.buildingId === buildingId) {
          prices.delete(key);
          writer.remove("businessPrices", { building_id: buildingId, item: row.item });
        }
    },
    check() {
      const out: string[] = [];
      for (const account of ledger.accounts())
        if (account.systemCode?.startsWith("debt:business:") && account.balance > 0n)
          out.push(`business debt account ${account.id} positive`);
      return out;
    },
  };
}
