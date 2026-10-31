// 동시호가 체결가 정하기 — docs/adr/2026-10-31-economy-core.md 5절, 기획 D-125(환율·주식·테라코인 = 동시호가)·D-411 1
// 순수 함수다(원장을 모른다). 회차에 모인 주문으로 체결가 하나와 주문마다 체결량을 낸다.
// - 후보 값 = 주문들의 값. 체결량(살 양·팔 양 중 작은 쪽)이 가장 큰 값 → 같으면 남는 양(|살 − 팔|)이 작은 값 →
//   같으면 기준가(지난 체결가)에 가까운 값 → 같으면 낮은 값.
// - 나누기: 살 쪽은 값 높은 차례, 팔 쪽은 값 낮은 차례, 같은 값이면 먼저 낸 주문(seq). 경계 주문은 부분 체결.
// - 모두 정수(로트 수·로트당 값)라 반올림이 없다.

export interface AuctionOrder {
  readonly id: number;
  readonly owner: number;
  /** 로트당 값(상대 화폐 최소 단위). 살 쪽은 상한, 팔 쪽은 하한 */
  readonly price: bigint;
  readonly lots: bigint;
  readonly seq: number;
}

export interface AuctionResult {
  /** 체결가(체결이 없으면 undefined) */
  readonly price: bigint | undefined;
  /** 체결 로트 수 */
  readonly lots: bigint;
  /** 주문 ID → 체결 로트 수(체결된 주문만) */
  readonly fills: Map<number, bigint>;
}

const abs = (value: bigint): bigint => (value < 0n ? -value : value);

export function clearCallAuction(
  buys: readonly AuctionOrder[],
  sells: readonly AuctionOrder[],
  reference: bigint | undefined,
): AuctionResult {
  const candidates = [...new Set([...buys, ...sells].map((order) => order.price))].toSorted((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  let best: { price: bigint; volume: bigint; imbalance: bigint } | undefined;
  for (const price of candidates) {
    let demand = 0n;
    let supply = 0n;
    for (const order of buys) if (order.price >= price) demand += order.lots;
    for (const order of sells) if (order.price <= price) supply += order.lots;
    const volume = demand < supply ? demand : supply;
    if (volume === 0n) continue;
    const imbalance = abs(demand - supply);
    const better =
      !best ||
      volume > best.volume ||
      (volume === best.volume &&
        (imbalance < best.imbalance ||
          (imbalance === best.imbalance &&
            reference !== undefined &&
            abs(price - reference) < abs(best.price - reference))));
    if (better) best = { price, volume, imbalance };
  }
  const fills = new Map<number, bigint>();
  if (!best) return { price: undefined, lots: 0n, fills };
  const clearing = best.price;
  const allocate = (
    list: readonly AuctionOrder[],
    eligible: (order: AuctionOrder) => boolean,
    ahead: (a: AuctionOrder, b: AuctionOrder) => number,
  ) => {
    let left = best?.volume ?? 0n;
    for (const order of list.filter(eligible).toSorted(ahead)) {
      if (left === 0n) break;
      const lots = order.lots < left ? order.lots : left;
      fills.set(order.id, lots);
      left -= lots;
    }
  };
  allocate(
    buys,
    (order) => order.price >= clearing,
    (a, b) => (a.price !== b.price ? (a.price > b.price ? -1 : 1) : a.seq - b.seq),
  );
  allocate(
    sells,
    (order) => order.price <= clearing,
    (a, b) => (a.price !== b.price ? (a.price < b.price ? -1 : 1) : a.seq - b.seq),
  );
  return { price: clearing, lots: best.volume, fills };
}
