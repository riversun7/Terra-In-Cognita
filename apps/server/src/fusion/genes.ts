// 유전자 조각(원장 물자) — 기획 D-478·D-481·49 N47, docs/adr/2026-11-07-cyborg-fusion-genes.md.
// 조각은 팩 아이템(gene 칸)이고 쌓이는 물자라 원장 계정(자산 = 아이템 ID, 위치 없음 = 장부 계정)에 든다 → 거래소에서 사고판다.
// 얻는 길(데이터): death = 그 종 유닛이 죽으면 소유자에게 설정 칸 n47_death_drop개(옛 LifeEngine._processDeath = 1개).
// 받는 조각은 시스템 발행 계정(issue:<ID>)에서 나온다(처음 나오는 물자). 쓰면 소각 계정(sink:<ID>)으로 간다.
import type { ItemEntry } from "@terra/content";
import { type GeneItem, deathGeneDrops } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";

/**
 * 서버 원장 물자 자산 코드 = 아이템 ID. DB 검사(ledger_accounts_asset_format ^[a-z][a-z0-9_]{1,47}$)가 쌍점을 받지 않아 시안 자료의
 * item:<ID> 앞머리를 쓰지 않는다(아이템 ID 형식이 같은 정규식이다)
 */
export const goodsAsset = (item: string): string => item;
/** 처음 나오는 물자의 시스템 계정(발행)·쓴 물자의 시스템 계정(소각) */
export const goodsIssueCode = (item: string): string => `issue:${goodsAsset(item)}`;
export const goodsSinkCode = (item: string): string => `sink:${goodsAsset(item)}`;

/** 켜진 팩 아이템 가운데 유전자 조각(아이템 ID 차례) */
export function geneItemsOf(items: readonly ItemEntry[]): GeneItem[] {
  const out: GeneItem[] = [];
  for (const item of items) {
    if (!item.enabled || !item.gene) continue;
    out.push({
      item: item.id,
      kind: item.gene.kind,
      species: item.gene.species.id,
      drops: item.gene.drops ? [...item.gene.drops] : [],
    });
  }
  return out.toSorted((a, b) => (a.item < b.item ? -1 : a.item > b.item ? 1 : 0));
}

/** 물자를 시스템 발행 계정에서 주체 장부 계정으로 낸다(한 거래). 수량 0 이하면 아무것도 하지 않는다 */
export function issueGoods(
  ledger: Ledger,
  ownerId: number,
  item: string,
  quantity: bigint,
  atMs: number,
  kind: string,
): void {
  if (quantity <= 0n) return;
  const asset = goodsAsset(item);
  ledger.post({
    kind,
    atMs,
    entries: [
      { account: ledger.systemAccount(goodsIssueCode(item), asset), amount: -quantity },
      { account: ledger.ownerAccount(ownerId, asset), amount: quantity },
    ],
  });
}

/** 주체 장부 계정의 물자를 소각 계정으로 보낸다(쓴 재료·조각). 잔고 확인은 부르는 쪽이 했다 */
export function burnGoods(
  ledger: Ledger,
  ownerId: number,
  item: string,
  quantity: bigint,
  atMs: number,
  kind: string,
): void {
  if (quantity <= 0n) return;
  const asset = goodsAsset(item);
  ledger.post({
    kind,
    atMs,
    entries: [
      { account: ledger.ownerAccount(ownerId, asset), amount: -quantity },
      { account: ledger.systemAccount(goodsSinkCode(item), asset), amount: quantity },
    ],
  });
}

/**
 * 그 종 유닛이 죽었을 때 소유자에게 조각을 준다(옛 LifeEngine). 준 아이템 ID 목록(없으면 빈 목록: 그 종의 조각이 팩에 없거나 꺼짐,
 * 옛 코드도 "유전자 조각 미등록 — 보상 없이 사망 처리")
 */
export function dropGenesOnDeath(
  ledger: Ledger,
  genes: readonly GeneItem[],
  ownerId: number,
  species: string,
  perDeath: number,
  atMs: number,
): string[] {
  if (perDeath <= 0) return [];
  const items = deathGeneDrops(genes, species);
  for (const item of items) issueGoods(ledger, ownerId, item, BigInt(perDeath), atMs, "gene_drop");
  return items;
}
