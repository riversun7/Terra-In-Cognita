// NPC 사업장: 시설 창고·장부·실제 운반 — 기획 D-570 1887(D-212 "NPC도 같은 시스템", D-569 1781 "무조건 판매이고 재무상태로 수익"), 바뀜 기획 대조 2053·2054
// (D-555 1509·1510 원문 "NPC만으로도 그대로 똑같이 시스템이 돌아간다고" + "요금은 사업장 운영에", "요금은 하루 끝 국고로", "물건도 플레이어처럼", D-564 1627,
// D-571 1945 — D-573 기술 전달), docs/adr/2026-11-15-business-ledger.md "바뀜 (D-573)". 예전(business-4 npcBooks.ts): 산출마다 나라가 사들여 바로 국고로 정산했고
// 물건은 도시 창고로 바로 갔다.
// NPC 도시 경제(시뮬과 같은 runEconomy)는 산출을 그 도시 창고(나라 몫)에 넣는다. 서버는 그 뒤에 플레이어 사업장과 같은 모양으로 고친다(시뮬 판정 그대로 — 시뮬
// 경제 규칙에 시설 창고·운반을 넣는 것은 일정, 질문 2151):
// 1) 산출 → 시설 창고: 이번 산출을 도시 창고에서 그 시설 건물 창고(사업장 창고)로 옮긴다. 그 동안 누구나 사업장 판매(business_buy)로 산다(시설에서 판다).
// 2) 재료비: 레시피 재료를 시설이 그 도시(나라) 창고에서 시세에 사들인다 — 시설 금고 → 국고(business_input). 금고가 모자라면 NPC 주인(나라)이 모자란 만큼 국고에서
//    운영 자금을 넣는다(business_invest — 주인이 넣기, 질문 2152). 국고도 모자라면 있는 만큼만.
// 3) 운반: 그 시설 일꾼이 시설 창고 → 그 도시 창고(가장 가까운 창고 건물)로 실제로 나른다(npcCarry.ts — 보는 2차맵은 화물을 진 휴먼, 아니면 시간 셈). 시간 =
//    시뮬과 같은 옮김 셈(haulTimeMs)을 한 사람이 한 번 오가는 시간 + 내려놓는 잠깐보다 짧지 않게. 옮김 칸이 없으면(거리 0·옮김 셈 끔) 바로.
// 4) 매출: 도시 창고에 닿은 만큼 나라가 시세(그 도시 거래소 마지막 체결가, 없으면 팩 시작 시세)에 사들인다 — 국고 → 시설 금고(business_sale, 같은 주머니라 소득세
//    없음). 국고가 모자라면 있는 만큼만(물건은 그대로 닿는다).
// 5) 정산: 시설 금고는 바로 나누지 않는다. 사업장 자동 정산(business/core.ts tick — 설정 칸 business_settle_period_ms, 기본 하루)이 적자를 갚고 남은 돈을 주주(그
//    세력 = 국고)에게 나눈다(하루 끝 국고 정산).
// 설정 칸 business_npc_books가 0이거나 사업장 장부가 없으면(시험) 예전처럼 도시 창고에 둔다(장부·운반 없음).
// 정수·BigInt만 쓴다.
import { buildingLocation, cityLocation } from "@terra/shared/goodsPlaces";
import { businessLocation } from "@terra/shared/businessBooks";
import type { LedgerBook } from "@terra/sim";
import type { BusinessCore } from "../business/core.ts";
import type { CarryBoard, CarryStack } from "./npcCarry.ts";

/** 운반이 닿을 때 부르는 예약 종류(npc/economy.ts가 받는다, 대상 = 운반 번호) */
export const EVENT_NPC_DELIVER = "npc_deliver";

export interface NpcDeliveryDeps {
  readonly book: LedgerBook;
  readonly business: Pick<BusinessCore, "receive" | "vaultBalance" | "invest">;
  readonly board: CarryBoard;
  /** 그 도시 묶음 하나의 시세(그 나라 화폐). 모르면 0 */
  priceOf(cityId: number, asset: string): bigint;
  /** 묶음 크기(기본 단위 수, 1 이상) */
  lotOf(asset: string): bigint;
  /** 운반이 닿을 시각에 예약을 건다 */
  schedule(atMs: number, deliveryId: number): void;
}

/** 산출 한 번(시설) */
export interface NpcProduced {
  /** 도시 경제 시설 ID(그 시설 첫 일꾼이 나른다) */
  readonly facilityId: number;
  readonly buildingId: number;
  readonly cityId: number;
  /** 도시 주인(NPC 세력 주체 — 국고) */
  readonly owner: number;
  readonly currency: string;
  readonly outputs: readonly CarryStack[];
  readonly inputs: readonly CarryStack[];
  /** 창고 둘레 칸(내려놓는 곳). 없으면 운반 없이 바로 */
  readonly to?: { readonly x: number; readonly y: number } | undefined;
  /** 운반 시간(ms, 0 이하 = 바로) */
  readonly haulMs: number;
  readonly atMs: number;
}

/** 물건 줄의 값(수량 × 묶음 값 ÷ 묶음 크기, 내림) */
export function stacksValue(
  stacks: readonly CarryStack[],
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

export interface NpcDeliveries {
  /** 산출 한 번(위 1~3). 옮긴 시설 창고 물건·재료비 */
  produced(input: NpcProduced): { moved: CarryStack[]; materials: bigint };
  /** 운반이 닿았다(위 4). 매출 */
  arrive(deliveryId: number, nowMs: number): bigint;
  /**
   * 켤 때 한 번: NPC 시설 창고(그 도시 주인 것)에 남은 물건을 그 도시 창고로 보낸다(운반 일은 메모리 — 끈 동안 잊었다). buildings = 시설 건물 → 도시·주인·화폐
   */
  sweep(
    buildings: ReadonlyMap<
      number,
      { readonly cityId: number; readonly owner: number; readonly currency: string }
    >,
    nowMs: number,
  ): number;
}

export function createNpcDeliveries(deps: NpcDeliveryDeps): NpcDeliveries {
  const { book, business, board } = deps;
  const pending = new Map<number, { cityId: number; owner: number; currency: string; buildingId: number }>();
  let lastId = 0;
  const move = (
    owner: number,
    asset: string,
    from: number,
    to: number,
    want: bigint,
    atMs: number,
  ): bigint => {
    const have = book.balanceOf(owner, asset, from);
    const qty = want < have ? want : have;
    if (qty <= 0n) return 0n;
    book.post({
      kind: "npc_facility_output",
      atMs,
      entries: [
        { account: book.ownerAccount(owner, asset, from), amount: -qty },
        { account: book.ownerAccount(owner, asset, to), amount: qty },
      ],
    });
    return qty;
  };
  /** 닿은 물건을 나라가 사들인다(국고 → 시설 금고, 국고가 모자라면 있는 만큼) */
  const buy = (
    entry: { cityId: number; owner: number; currency: string; buildingId: number },
    stacks: readonly CarryStack[],
    atMs: number,
  ): bigint => {
    const treasury = book.ownerAccount(entry.owner, entry.currency);
    const worth = stacksValue(
      stacks,
      (asset) => deps.priceOf(entry.cityId, asset),
      (asset) => deps.lotOf(asset),
    );
    const have = book.balance(treasury);
    const sale = worth < have ? worth : have > 0n ? have : 0n;
    if (sale > 0n)
      business.receive({
        from: treasury,
        buildingId: entry.buildingId,
        asset: entry.currency,
        amount: sale,
        kind: "business_sale",
        atMs,
      });
    return sale;
  };

  const arrive = (deliveryId: number, nowMs: number): bigint => {
    const entry = pending.get(deliveryId);
    if (!entry) return 0n;
    pending.delete(deliveryId);
    const landed = board.finish(`f:${String(deliveryId)}`, nowMs);
    return buy(entry, landed, nowMs);
  };

  return {
    produced(input) {
      const shop = buildingLocation(input.buildingId);
      const city = cityLocation(input.cityId);
      // 1) 산출 → 시설 창고
      const moved: CarryStack[] = [];
      for (const stack of input.outputs) {
        const qty = move(input.owner, stack.asset, city, shop, stack.qty, input.atMs);
        if (qty > 0n) moved.push({ asset: stack.asset, qty });
      }
      // 2) 재료비(금고가 모자라면 주인이 국고에서 넣는다)
      const treasury = book.ownerAccount(input.owner, input.currency);
      const cost = stacksValue(
        input.inputs,
        (asset) => deps.priceOf(input.cityId, asset),
        (asset) => deps.lotOf(asset),
      );
      const vault = business.vaultBalance(input.buildingId, input.owner, input.currency);
      if (cost > vault) {
        const want = cost - vault;
        const have = book.balance(treasury);
        const put = want < have ? want : have;
        if (put > 0n) business.invest(input.buildingId, input.owner, input.currency, put, input.atMs);
      }
      const after = business.vaultBalance(input.buildingId, input.owner, input.currency);
      const materials = cost < after ? cost : after > 0n ? after : 0n;
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
      // 3) 운반(옮김 칸이 없으면 바로 닿는다)
      lastId += 1;
      const id = lastId;
      pending.set(id, {
        cityId: input.cityId,
        owner: input.owner,
        currency: input.currency,
        buildingId: input.buildingId,
      });
      board.post({
        key: `f:${String(id)}`,
        cityId: input.cityId,
        owner: input.owner,
        stacks: moved,
        from: shop,
        to: city,
        x: input.to?.x ?? 0,
        y: input.to?.y ?? 0,
        fromMs: input.atMs,
        untilMs: input.atMs + Math.max(0, input.haulMs),
        worker: input.facilityId,
      });
      if (!input.to || input.haulMs <= 0 || moved.length === 0) arrive(id, input.atMs);
      else deps.schedule(input.atMs + input.haulMs, id);
      return { moved, materials };
    },
    arrive,
    sweep(buildings, nowMs) {
      let count = 0;
      const at = new Map<number, number>();
      for (const id of buildings.keys()) at.set(buildingLocation(id), id);
      // 먼저 모으고 옮긴다(옮기며 새 계정이 생긴다)
      for (const account of Array.from(book.accounts())) {
        if (account.ownerId === null || account.location === null || account.balance <= 0n) continue;
        if (!account.asset.startsWith("item:")) continue;
        const buildingId = at.get(account.location);
        const entry = buildingId === undefined ? undefined : buildings.get(buildingId);
        if (buildingId === undefined || !entry || entry.owner !== account.ownerId) continue;
        const qty = move(
          entry.owner,
          account.asset,
          account.location,
          cityLocation(entry.cityId),
          account.balance,
          nowMs,
        );
        if (qty > 0n) {
          buy({ ...entry, buildingId }, [{ asset: account.asset, qty }], nowMs);
          count += 1;
        }
      }
      return count;
    },
  };
}
