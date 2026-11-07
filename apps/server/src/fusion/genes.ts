// 유전자·원장 물자 도우미 — 기획 D-478·D-481·D-516·49 N47, docs/adr/2026-11-07-cyborg-fusion-genes.md "바뀜 (D-516)".
// - 유전자 = 팩 아이템(gene 칸: 종류·종·얻는 길)의 보유 물건 인스턴스(item_holdings.gene에 값). 스탯 유전자는 총합·분포·속성, 스킬 유전자는
//   스킬 하나(스킬마다 종류). 하나하나 값이 달라 수량 1이다(D-516). 이 파일은 팩 아이템 → 유전자 정의, 칸 → 화면 자료를 만든다.
// - 융합 재료(티타늄 괴·마이크로칩)는 쌓이는 물자라 원장 계정(자산 = 아이템 ID, 위치 없음 = 장부 계정)에 든다.
//   처음 나오는 물자 = 시스템 발행 계정(issue:<ID>), 쓴 물자 = 소각 계정(sink:<ID>).
import type { ItemEntry } from "@terra/content";
import type { FusionGeneView } from "@terra/shared/fusion";
import type { LocalizedName } from "@terra/shared/roster";
import { type GeneItem, type StatGene, geneStatValues, mainStatIndex } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { GenePayload, StatGenePayload } from "../holdings/genePayload.ts";
import { carrierOf } from "../holdings/state.ts";
import type { HoldingRecord } from "../holdings/state.ts";
import type { RosterCatalog } from "../roster/catalog.ts";
import type { GeneCatalog } from "./geneCommands.ts";

/**
 * 서버 원장 물자 자산 코드 = 아이템 ID. DB 검사(ledger_accounts_asset_format ^[a-z][a-z0-9_]{1,47}$)가 쌍점을 받지 않아 시안 자료의
 * item:<ID> 앞머리를 쓰지 않는다(아이템 ID 형식이 같은 정규식이다)
 */
export const goodsAsset = (item: string): string => item;
/** 처음 나오는 물자의 시스템 계정(발행)·쓴 물자의 시스템 계정(소각) */
export const goodsIssueCode = (item: string): string => `issue:${goodsAsset(item)}`;
export const goodsSinkCode = (item: string): string => `sink:${goodsAsset(item)}`;

/** 켜진 팩 아이템 가운데 유전자(아이템 ID 차례) */
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

/** 주체 장부 계정의 물자를 소각 계정으로 보낸다(쓴 재료). 잔고 확인은 부르는 쪽이 했다 */
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

/** 저장한 스탯 유전자 값 → 판정 값 */
export const statGeneOfPayload = (payload: StatGenePayload): StatGene => ({
  total: payload.total,
  dist: payload.dist,
  elements: payload.elements,
});

/** 유전자 칸 하나 → 화면 자료(값이 틀린 칸은 undefined) */
export function geneViewOf(
  record: HoldingRecord,
  names: {
    readonly item: (id: string) => LocalizedName | undefined;
    readonly skill: (id: string) => LocalizedName | undefined;
  },
): FusionGeneView | undefined {
  const gene: GenePayload | null | undefined = record.gene;
  if (!gene) return undefined;
  const base = {
    id: record.id,
    item: record.itemId,
    name: names.item(record.itemId) ?? { ko: record.itemId, en: record.itemId },
    species: gene.species,
    fromUnit: gene.from,
    level: gene.level,
    unit: carrierOf(record.location),
    createdAt: record.createdAtMs,
  };
  if (gene.kind === "skill")
    return {
      ...base,
      kind: "skill",
      skill: gene.skill,
      skillName: names.skill(gene.skill) ?? null,
      total: null,
      dist: null,
      stats: null,
      main: null,
      elements: null,
      generation: 0,
    };
  const stat = statGeneOfPayload(gene);
  return {
    ...base,
    kind: "stat",
    skill: null,
    skillName: null,
    total: gene.total,
    dist: [...gene.dist],
    stats: geneStatValues(stat),
    main: mainStatIndex(stat),
    elements: [...gene.elements],
    generation: gene.generation,
  };
}

/** 실효 전투 자료(켜진 스킬·유닛 종류 스킬 칸)와 이름 표 → 유전자 명령의 스킬 자료(부를 때마다 지금 값) */
export function geneCatalogFrom(roster: () => RosterCatalog): () => GeneCatalog {
  return () => {
    const catalog = roster();
    return {
      skills: catalog.combat.skills.map((skill) => skill.id),
      skillName: (id) => catalog.names.skills[id],
      skillSlots: (kind) => catalog.combat.unitKinds.find((entry) => entry.id === kind)?.skillSlots,
    };
  };
}
