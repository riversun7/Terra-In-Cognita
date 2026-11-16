// NPC 사업장 장부(서버) — 기획 D-570 1887(D-212 "NPC도 같은 시스템", D-569 1781 "주인이 꺼내는 기능은 존재하지 않는다 무조건 판매이고 재무상태로
// 수익으로 잡혀야한다"), docs/adr/2026-11-15-business-ledger.md "바뀜 (D-570)".
// NPC 도시 경제(npc/economy.ts — 시뮬과 같은 runEconomy)는 시설 산출을 그 도시 창고(나라 몫)에 바로 넣는다(물건 흐름·시뮬 판정은 그대로). 여기서는
// 그 산출을 플레이어 사업장처럼 장부에 적는다: 산출 한 번마다
// 1) 매출: 그 도시(나라)가 산출을 시세에 사들인다 — 나라 국고(그 나라 화폐) → 시설 금고(business_sale, 같은 주머니라 소득세 없음, core.receive).
// 2) 재료비: 시설이 레시피 재료를 그 도시 창고에서 시세에 사들인다 — 시설 금고 → 국고(business_input, 장부 "재료비" 칸).
// 3) 정산: 남은 금고 돈을 바로 주주(그 세력 = 국고)에게 나눈다(core.settle) — 국고 돈이 시설 금고에 묶여 NPC 거래 판단을 바꾸지 않게.
// 시세 = 그 도시 거래소 마지막 체결가(묶음 값), 없으면 팩 시작 시세. 금액 = 수량 × 값 ÷ 묶음 크기(내림). 국고가 모자라면 있는 만큼만(물건은 그대로).
// 설정 칸 business_npc_books가 0이면 하지 않는다. 사업장 장부가 없으면(시험) 하지 않는다.
import { businessLocation } from "@terra/shared/businessBooks";
import type { LedgerBook } from "@terra/sim";
import type { BusinessCore } from "../business/core.ts";

export interface NpcSaleInput {
  readonly business: Pick<BusinessCore, "receive" | "settle" | "vaultBalance">;
  readonly book: LedgerBook;
  /** 도시 주인(NPC 세력 주체) — 시설 주인과 같을 때만 부른다 */
  readonly owner: number;
  readonly currency: string;
  readonly buildingId: number;
  readonly outputs: readonly { readonly asset: string; readonly qty: bigint }[];
  readonly inputs: readonly { readonly asset: string; readonly qty: bigint }[];
  /** 묶음 하나의 시세(그 나라 화폐). 모르면 0 */
  readonly priceOf: (asset: string) => bigint;
  /** 묶음 크기(기본 단위 수, 1 이상) */
  readonly lotOf: (asset: string) => bigint;
  readonly atMs: number;
}

/** 물건 줄의 값(수량 × 묶음 값 ÷ 묶음 크기, 내림) */
export function stacksValue(
  stacks: readonly { readonly asset: string; readonly qty: bigint }[],
  priceOf: (asset: string) => bigint,
  lotOf: (asset: string) => bigint,
): bigint {
  let sum = 0n;
  for (const stack of stacks) {
    const lot = lotOf(stack.asset);
    if (stack.qty > 0n) sum += (stack.qty * priceOf(stack.asset)) / (lot > 0n ? lot : 1n);
  }
  return sum;
}

/** 산출 한 번을 장부에 적는다(위 머리 주석). 적은 매출·재료비 */
export function recordNpcSale(input: NpcSaleInput): { sale: bigint; materials: bigint } {
  const { book, business } = input;
  const treasury = book.ownerAccount(input.owner, input.currency);
  const worth = stacksValue(input.outputs, input.priceOf, input.lotOf);
  const have = book.balance(treasury);
  const sale = worth < have ? worth : have > 0n ? have : 0n;
  if (sale > 0n)
    business.receive({
      from: treasury,
      buildingId: input.buildingId,
      asset: input.currency,
      amount: sale,
      kind: "business_sale",
      atMs: input.atMs,
    });
  const cost = stacksValue(input.inputs, input.priceOf, input.lotOf);
  const vault = business.vaultBalance(input.buildingId, input.owner, input.currency);
  const materials = cost < vault ? cost : vault > 0n ? vault : 0n;
  if (materials > 0n)
    book.post({
      kind: "business_input",
      atMs: input.atMs,
      entries: [
        {
          account: book.ownerAccount(input.owner, input.currency, businessLocation(input.buildingId)),
          amount: -materials,
        },
        { account: treasury, amount: materials },
      ],
    });
  if (sale > 0n || materials > 0n)
    business.settle(input.buildingId, input.atMs, { asset: input.currency, amount: 0n });
  return { sale, materials };
}
