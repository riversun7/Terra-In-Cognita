// 납품 명성(서버) — 기획 D-326("명성은 납품·방어·의뢰로 그 나라에서 쌓는다. 나라마다 따로다"), 질문 2102 → 2182.
// 납품 = 그 나라 세력(정부·국고 주인)의 물자 거래소 사기 주문에 물건을 판 것. 거래소 체결(market/books.ts pushTrade — 원장 거래와 같은 동기
// 처리 = 같은 커밋)마다 판 쪽이 사용자이고 산 쪽이 세력 소유 주체(user_id 없음, faction_id 있음)면 그 세력 나라에 납품 가치를 모은다.
// - 납품 가치 = 체결 묶음 수 × 그 물건 시작 시세(팩 startPrice, 시뮬 경제 목록). 나라 화폐와 상관없는 기준 값이라 화폐가 다른 나라끼리도 같은
//   물건·양이면 같은 명성이다. 체결 값(나라 화폐)은 보지 않는다.
// - 설정 칸 d326_renown_delivery_value(가치 몇에 명성 1)마다 명성 1을 더한다(CyborgService.addRenown — 쓰기 대기열 user_nation_renown).
//   1에 못 미친 나머지는 (사용자, 나라)마다 메모리에 두고 다음 납품에 더한다. 서버를 다시 켜면 나머지(명성 1 미만)는 사라진다 [임시] 질문 2182.
// - 나라 국적과 상관없다(방어 명성과 같다 — 그 나라에서 쌓는다). 사이보그가 없는 사용자는 건너뛴다(나머지도 버린다).
// - 세력이 판 것(NPC가 유저 사기 주문에 판 것)·유저끼리 체결·세력끼리 체결은 명성이 없다.
import type { RenownCoefficients } from "@terra/sim";
import type { CyborgService } from "../cyborg/service.ts";
import type { OwnerRow } from "./persist/load.ts";

export interface DeliveryRenownParts {
  readonly owners: ReadonlyMap<number, Pick<OwnerRow, "userId" | "factionId">>;
  readonly cyborgs: Pick<CyborgService, "addRenown">;
  readonly rules: () => { readonly renown: Pick<RenownCoefficients, "deliveryValue"> };
}

/** 체결 알림에서 쓰는 칸만(market/books.ts FillNotice가 맞는다) */
export interface DeliveryFill {
  readonly book: { readonly asset: string };
  readonly trade: {
    readonly side: "buy" | "sell";
    readonly makerOwner: number;
    readonly takerOwner: number;
    readonly qty: bigint;
    readonly at: number;
  };
}

/** NPC 도시 경제에서 쓰는 것만(npc/economy.ts ServerEconomy가 맞는다) */
export interface DeliverySource {
  readonly registry: { onFill(listener: (notice: DeliveryFill) => void): () => void };
  readonly economy: { readonly catalog: { readonly startPrice: ReadonlyMap<string, bigint> } };
}

/** 체결 하나의 납품: 판 사용자·산 나라(세력 행 ID)·납품 가치. 납품이 아니면 undefined */
export function deliveryOf(
  owners: DeliveryRenownParts["owners"],
  trade: Omit<DeliveryFill["trade"], "at">,
  startPrice: bigint | undefined,
): { readonly userId: string; readonly nation: number; readonly value: bigint } | undefined {
  const seller = trade.side === "buy" ? trade.makerOwner : trade.takerOwner;
  const buyer = trade.side === "buy" ? trade.takerOwner : trade.makerOwner;
  const userId = owners.get(seller)?.userId;
  const buyerRow = owners.get(buyer);
  const nation = buyerRow?.factionId;
  if (!userId || !buyerRow || buyerRow.userId || nation === null || nation === undefined) return undefined;
  const value = trade.qty * (startPrice ?? 0n);
  return value > 0n ? { userId, nation, value } : undefined;
}

/**
 * NPC 도시 경제의 거래소 체결에 납품 명성을 붙인다. 경제가 없으면(NPC 사회 끔) 아무것도 하지 않는다. 돌려준 함수로 그친다(시험).
 * 받은 명성 합을 알고 싶으면 onGrant를 준다(시험)
 */
export function attachDeliveryRenown(
  source: DeliverySource | undefined,
  parts: DeliveryRenownParts,
  onGrant?: (userId: string, nation: number, renown: number) => void,
): (() => void) | undefined {
  if (!source) return undefined;
  /** (사용자|나라) → 명성 1에 못 미친 납품 가치 */
  const carry = new Map<string, bigint>();
  return source.registry.onFill(({ book, trade }) => {
    const unit = BigInt(Math.max(0, Math.trunc(parts.rules().renown.deliveryValue)));
    if (unit <= 0n) return;
    const delivery = deliveryOf(parts.owners, trade, source.economy.catalog.startPrice.get(book.asset));
    if (!delivery) return;
    const key = `${delivery.userId}|${delivery.nation}`;
    const total = (carry.get(key) ?? 0n) + delivery.value;
    const renown = total / unit;
    const rest = total % unit;
    if (renown === 0n) {
      carry.set(key, rest);
      return;
    }
    const amount = Number(renown);
    if (parts.cyborgs.addRenown(delivery.userId, delivery.nation, amount, trade.at) === undefined) {
      carry.delete(key);
      return;
    }
    if (rest === 0n) carry.delete(key);
    else carry.set(key, rest);
    onGrant?.(delivery.userId, delivery.nation, amount);
  });
}
