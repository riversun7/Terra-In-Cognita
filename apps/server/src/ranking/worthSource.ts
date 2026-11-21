// 랭킹 전투력·자산 셈에 세계가 빌려 주는 것(worth.ts WorthSource) — house-9, 기획 D-576·D-7022·D-555 1512. docs/adr/2026-11-07-ranking.md "바뀜 (house-9)".
// app.ts(1,000줄 상한)에서 잇기 쉽게 여기서 만든다. 집계 한 번마다 새로 만들고 버린다(값 표를 들고 있지 않는다 — 메모리).
// - 전투력: 세계 전투 몸(world/battleBodies.ts basePower — 버프·부상 뺀 몸).
// - 값 매기기(createAssetPricer): 기준 통화 = 그대로, 나라 화폐 = 양 × 지난 환전 체결가 ÷ 로트(없으면 1:1), 물건 = 양 × 묶음 값 ÷ 묶음 크기 — 묶음 값 =
//   거래소마다 마지막 체결가(그 거래소 화폐 → 기준 통화)의 평균, 체결이 없으면 팩 시작 시세. 그 밖(지분·모르는 자산) = 0.
// 금액은 BigInt 정수로만 센다.
import type { World } from "../world/world.ts";
import type { WorthSource } from "./worth.ts";

/** 값 매기기 입력(시험은 직접 준다) */
export interface PricerInput {
  /** 기준 통화(원장 자산 코드) */
  readonly base: string;
  /** 환전 로트 크기(화폐 최소 단위) */
  readonly fxLot: bigint;
  /** 그 화폐의 로트당 기준 통화 값(지난 체결가). 화폐가 아니면 undefined */
  readonly fxRate: (currency: string) => bigint | undefined;
  /** 거래소마다 물건·화폐·마지막 체결가(묶음 값) */
  readonly books: Iterable<{
    readonly asset: string;
    readonly currency: string;
    readonly lastPrice: bigint | undefined;
  }>;
  /** 팩 시작 시세(묶음 값, 기준 통화). 없으면 undefined */
  readonly startPrice: (asset: string) => bigint | undefined;
  /** 묶음 크기(기본 단위 개수, 없으면 1) */
  readonly lotSize: (asset: string) => bigint;
}

/** 자산 qty → 기준 통화 최소 단위 */
export function createAssetPricer(input: PricerInput): (asset: string, qty: bigint) => bigint {
  const toBase = (currency: string, amount: bigint): bigint | undefined => {
    if (currency === input.base) return amount;
    const rate = input.fxRate(currency);
    return rate === undefined || input.fxLot <= 0n ? undefined : (amount * rate) / input.fxLot;
  };
  // 물건마다 거래소 마지막 체결가 평균(기준 통화) — 한 번만 모은다
  const sums = new Map<string, { sum: bigint; n: bigint }>();
  for (const book of input.books) {
    if (book.lastPrice === undefined) continue;
    const price = toBase(book.currency, book.lastPrice);
    if (price === undefined || price <= 0n) continue;
    const entry = sums.get(book.asset) ?? { sum: 0n, n: 0n };
    entry.sum += price;
    entry.n += 1n;
    sums.set(book.asset, entry);
  }
  const lotPrice = (asset: string): bigint | undefined => {
    const entry = sums.get(asset);
    return entry ? entry.sum / entry.n : input.startPrice(asset);
  };
  return (asset, qty) => {
    if (qty <= 0n) return 0n;
    const money = toBase(asset, qty);
    if (money !== undefined) return money;
    if (!asset.startsWith("item:")) return 0n;
    const price = lotPrice(asset);
    const lot = input.lotSize(asset);
    return price === undefined || lot <= 0n ? 0n : (qty * price) / lot;
  };
}

/** 세계 → 셈 출처(세계가 준비되지 않았으면 undefined). base = 기준 통화 */
export function worldWorthSource(world: World | undefined, base: string, now: () => number) {
  return (): WorthSource | undefined => {
    if (!world || world.status().state !== "ready") return undefined;
    const bodies = world.persistence?.bodies;
    const econ = world.npc?.economy;
    const at = now();
    const books = econ ? [...econ.registry.books()] : [];
    const valueOf = createAssetPricer({
      base,
      fxLot: econ?.economy.settings.fxLot ?? 1n,
      fxRate: (currency) => {
        if (!econ) return undefined;
        const market = econ.economy.fx.get(currency);
        if (market) return market.lastPrice ?? econ.economy.settings.fxLot;
        // 발행 나라가 있는 화폐(시장이 아직 없음)는 1:1
        return econ.economy.issuer.has(currency) ? econ.economy.settings.fxLot : undefined;
      },
      books: books.map((book) => ({
        asset: book.asset,
        currency: book.market.config.currency,
        lastPrice: book.market.lastPrice,
      })),
      startPrice: (asset) => econ?.economy.catalog.startPrice.get(asset),
      lotSize: (asset) => econ?.economy.catalog.lotSize.get(asset) ?? 1n,
    });
    return {
      valueOf,
      ...(bodies ? { powerOf: (unitId: number) => bodies.basePower(unitId, at) } : {}),
    };
  };
}

/** 랭킹 집계 일정이 세계에서 받는 것(app.ts 1,000줄 상한 — 한 줄로 잇는다): 준비됐나·쓰기 대기열이 DB에 닿을 때까지·전투력·자산 출처 */
export function rankingWorldHooks(world: World, base: string, now: () => number) {
  return {
    ready: (): boolean => world.status().state === "ready",
    durable: async (): Promise<void> => world.persistence?.writer.durable(),
    worth: worldWorthSource(world, base, now),
  };
}
