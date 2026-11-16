// NPC 세력의 거래소 운반(기획 D-212·D-564 1626 "NPC 운반은 시간 계산 가능" — 질문 1945 답, docs/adr/2026-11-16-exchange-buildings.md "바뀜 (D-571)").
// 서버 NPC만 쓴다(시뮬 NPC 경제는 도시를 물건 자리로 쓰고 거래소 건물이 없다 — 판정 그대로, SIM_VERSION 그대로).
// - 거래소 건물이 있어야 거래: 그 도시에 일하는 물자 거래소 건물이 없으면 NPC 주문(사기·팔기)을 받지 않는다(books.ts가 막는다).
// - NPC 물건 자리 = 유저와 같은 그 도시 물자 거래소 건물 창고(주인 = 세력). 팔 물건은 도시 창고에서 거래소 건물로 실어 날라야 오른다:
//   팔기 주문은 거래소 건물 창고에 이미 있는 만큼 바로 걸고, 나머지는 보이지 않는 운반꾼이 도시 칸 → 거래소 건물을 나르는 시간(유저 반입과 같은
//   셈 — @terra/sim haulMs, 운반꾼 하나) 뒤에 도시 창고에서 옮겨 건다(그때 도시 창고에 남은 만큼, 묶음 단위로).
// - 거래소 건물 창고에 남은 NPC 물건(산 물건·돌려받은 팔 물건)은 같은 셈 시간 뒤에 그 도시 창고로 돌아간다(닿을 때 남은 만큼).
// - 운반 대기는 메모리다. 다시 켜면 대기 중 팔기는 잊는다(물건은 아직 도시 창고 — 잃지 않는다, 다음 거래 판단이 다시 건다). 거래소 건물 창고에
//   남은 NPC 물건은 켠 뒤 첫 틱에 훑어 돌려보낸다.
// - 서버 NPC 사이 도시 운송(시뮬 ship, 서버 shipMs 0)은 지금처럼 바로다: 거래 판단의 "남의 자리 물건 보내기"가 거래소 건물 창고의 NPC 물건을
//   먼저 데려갈 수 있다(그러면 돌아올 것이 없다) — 질문 2091.
// 정수 연산만 쓴다.
import { buildingLocation, cityLocation } from "@terra/shared/goodsPlaces";
import type { LedgerBook } from "@terra/sim";

export interface NpcHaulOptions {
  readonly ledger: LedgerBook;
  /** 그 도시 물자 거래소 건물(일하는 것). 없으면 undefined */
  readonly exchangeOf: (cityId: number) => number | undefined;
  /** 도시 창고 ↔ 그 거래소 건물 운반 시간(ms, 0 이하 = 바로). 없으면 늘 바로 */
  readonly haulMs?: ((cityId: number, buildingId: number, grams: bigint) => number) | undefined;
  /** 자산 한 기본 단위 무게(g). 없으면 1 */
  readonly weightOf?: ((asset: string) => bigint) | undefined;
  /** 유저 주체인가(NPC 물건만 훑는다) */
  readonly isUser: (ownerId: number) => boolean;
}

/** 운반을 기다리는 NPC 팔기 */
export interface PendingSell {
  readonly owner: number;
  readonly cityId: number;
  readonly asset: string;
  readonly lot: bigint;
  readonly price: bigint;
  readonly lots: bigint;
  readonly expiresAtMs: number;
  readonly arriveAtMs: number;
}

export interface NpcHauler {
  /** NPC 팔기: 지금 걸 묶음 수(거래소 건물 창고에 있는 만큼, 운반 시간이 0이면 도시 창고에서 바로 옮긴 만큼 더). 나머지는 운반 대기 */
  sell(p: Omit<PendingSell, "arriveAtMs">, nowMs: number): bigint;
  /** 그 주인의 그 도시·물건 운반 대기 팔기를 버린다(거래 판단이 주문을 모두 거둘 때) */
  cancel(owner: number, cityId: number, asset: string): void;
  /** NPC 물건이 거래소 건물 창고에 남았을 수 있다(돌려보내기 후보) */
  touch(owner: number, cityId: number, asset: string): void;
  /** 닿은 팔기(도시 창고 → 거래소 건물 창고로 옮긴 뒤, 부르는 쪽이 건다)와 돌려보내기를 처리한다. 걸 팔기 목록 */
  tick(nowMs: number, cities: Iterable<number>): PendingSell[];
  /** 대기 수(지표·시험) */
  readonly pending: () => number;
}

const keyOf = (owner: number, cityId: number, asset: string): string => `${owner}|${cityId}|${asset}`;

export function createNpcHauler(o: NpcHaulOptions): NpcHauler {
  const sells: PendingSell[] = [];
  /** 돌려보내기 후보(owner|city|asset) */
  const dirty = new Set<string>();
  /** 돌려보내는 중: 열쇠 → 닿는 시각 */
  const returning = new Map<string, { owner: number; cityId: number; asset: string; atMs: number }>();
  let swept = false;
  const weight = (asset: string): bigint => o.weightOf?.(asset) ?? 1n;
  const timeOf = (cityId: number, buildingId: number, asset: string, qty: bigint): number =>
    o.haulMs ? o.haulMs(cityId, buildingId, qty * weight(asset)) : 0;

  /** from → to 원장 옮기기(있는 만큼, unit 단위로 버림). 옮긴 양 */
  const move = (
    owner: number,
    asset: string,
    from: number,
    to: number,
    want: bigint,
    unit: bigint,
    atMs: number,
  ): bigint => {
    const have = o.ledger.balanceOf(owner, asset, from);
    let qty = want < have ? want : have;
    qty -= qty % unit;
    if (qty <= 0n) return 0n;
    o.ledger.post({
      kind: "npc_exchange_haul",
      atMs,
      entries: [
        { account: o.ledger.ownerAccount(owner, asset, from), amount: -qty },
        { account: o.ledger.ownerAccount(owner, asset, to), amount: qty },
      ],
    });
    return qty;
  };

  return {
    sell(p, nowMs) {
      const exchange = o.exchangeOf(p.cityId);
      if (exchange === undefined) return 0n;
      const at = buildingLocation(exchange);
      const ready = o.ledger.balanceOf(p.owner, p.asset, at) / p.lot;
      if (ready >= p.lots) return p.lots;
      const rest = p.lots - ready;
      const ms = timeOf(p.cityId, exchange, p.asset, rest * p.lot);
      if (ms <= 0)
        return ready + move(p.owner, p.asset, cityLocation(p.cityId), at, rest * p.lot, p.lot, nowMs) / p.lot;
      // 거래소 건물 창고의 물건이 돌아가는 중이면 그대로 두고 새 짐을 기다린다(돌려보내기는 닿을 때 남은 만큼)
      sells.push({ ...p, lots: rest, arriveAtMs: nowMs + ms });
      return ready;
    },
    cancel(owner, cityId, asset) {
      for (let i = sells.length - 1; i >= 0; i -= 1) {
        const p = sells[i];
        if (p && p.owner === owner && p.cityId === cityId && p.asset === asset) sells.splice(i, 1);
      }
    },
    touch(owner, cityId, asset) {
      if (!o.isUser(owner)) dirty.add(keyOf(owner, cityId, asset));
    },
    tick(nowMs, cities) {
      // 켠 뒤 처음: 거래소 건물 창고에 남은 NPC 물건을 훑는다(한 번만 원장 전체)
      if (!swept) {
        swept = true;
        const where = new Map<number, number>();
        for (const cityId of cities) {
          const exchange = o.exchangeOf(cityId);
          if (exchange !== undefined) where.set(buildingLocation(exchange), cityId);
        }
        for (const account of o.ledger.accounts()) {
          if (account.ownerId === null || account.location === null || account.balance <= 0n) continue;
          const cityId = where.get(account.location);
          if (cityId !== undefined && !o.isUser(account.ownerId))
            dirty.add(keyOf(account.ownerId, cityId, account.asset));
        }
      }
      // 닿은 돌려보내기: 거래소 건물 창고에 남은 만큼 도시 창고로
      for (const [key, entry] of returning) {
        if (entry.atMs > nowMs) continue;
        returning.delete(key);
        const exchange = o.exchangeOf(entry.cityId);
        if (exchange === undefined) continue;
        move(
          entry.owner,
          entry.asset,
          buildingLocation(exchange),
          cityLocation(entry.cityId),
          o.ledger.balanceOf(entry.owner, entry.asset, buildingLocation(exchange)),
          1n,
          nowMs,
        );
      }
      // 새 돌려보내기
      for (const key of dirty) {
        dirty.delete(key);
        if (returning.has(key)) continue;
        const [ownerText, cityText, ...assetParts] = key.split("|");
        const owner = Number(ownerText);
        const cityId = Number(cityText);
        const asset = assetParts.join("|");
        const exchange = o.exchangeOf(cityId);
        if (exchange === undefined) continue;
        const held = o.ledger.balanceOf(owner, asset, buildingLocation(exchange));
        if (held <= 0n) continue;
        const ms = timeOf(cityId, exchange, asset, held);
        if (ms <= 0) move(owner, asset, buildingLocation(exchange), cityLocation(cityId), held, 1n, nowMs);
        else returning.set(key, { owner, cityId, asset, atMs: nowMs + ms });
      }
      // 닿은 팔기: 도시 창고 → 거래소 건물 창고(남은 만큼, 묶음 단위). 거는 것은 부르는 쪽
      const due: PendingSell[] = [];
      for (let i = sells.length - 1; i >= 0; i -= 1) {
        const p = sells[i];
        if (!p || p.arriveAtMs > nowMs) continue;
        sells.splice(i, 1);
        const exchange = o.exchangeOf(p.cityId);
        if (exchange === undefined) continue;
        const moved = move(
          p.owner,
          p.asset,
          cityLocation(p.cityId),
          buildingLocation(exchange),
          p.lots * p.lot,
          p.lot,
          nowMs,
        );
        if (moved > 0n) due.push({ ...p, lots: moved / p.lot });
      }
      return due.toReversed();
    },
    pending: () => sells.length + returning.size,
  };
}
