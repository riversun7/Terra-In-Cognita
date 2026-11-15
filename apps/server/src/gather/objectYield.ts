// 원자재 오브젝트 한 번에서 나오는 아이템 고르기 — 기획 D-540 1222(다 + 나), D-552(docs/adr/2026-11-15-gather-object-tiers.md).
// - 오브젝트 = 원자재 종류(대표 아이템 item의 중분류 사다리 — 맡는 시설 사다리에 들면 그 사다리) + 양 + 티어 범위(tierRange, 없으면 대표 아이템
//   티어 하나). 한 번 캘 때 채집 확률표(표 하나)와 캐는 유닛의 유효 스탯(주 + 보조 + 맡는 시설 반경 안이면 레벨 보너스, @terra/sim gatherStat)으로
//   티어를 뽑고 범위로 자른 뒤, 그 티어에 대표 아이템이 있으면 대표 아이템, 아니면 그 티어 아이템 하나. 바뀜 (기획 D-567): 맡는 시설이 건물
//   채집소(선택 방식 — 농장·목장·약초원)여도 오브젝트는 직접 채집용이라 늘 확률표로 뽑는다(옛 해금 티어 고르기 없음 — 건물 채집소는 오브젝트를
//   쓰지 않는다, gather/station.ts).
// - 굴림표(table, 난파선·고래 무리): 가중치(‰)로 하나를 뽑는다.
// - 직접 채집(objectYieldItem)과 채집소 일꾼(gather/station.ts lotRoll → labor/gatherWork.ts)이 같은 규칙(objectRollOf)과 같은 함수
//   (@terra/sim rollGatherOutputs)를 쓴다(D-552 "직접 채집과 일꾼 채집이 같은 규칙").
// - 바뀜 (기획 D-562 1561): 오브젝트마다 아이템별 비중(itemWeights)이 있으면 그 티어는 비중대로 고른다(적지 않은 티어는 대표 → 고르게).
// 난수는 (유닛, 오브젝트, 차례)로 정한 시드 하나(서버 권위, 같은 입력이면 같은 결과). 정수 연산만 쓴다.
import { createRng } from "@terra/shared";
import { GATHER_TIERS, gatherSubcategories } from "@terra/shared/gatherMath";
import { gatherStat, mix32, rollGatherOutputs } from "@terra/sim";
import type { GatherBand, GatherSubcategorySource } from "@terra/sim";
import type { LotRoll } from "../labor/gatherWork.ts";
import type { GatherKind } from "./kinds.ts";

/** 오브젝트 규칙에 드는 시설·아이템 자료(시설 목록 FacilityCatalog의 일부) */
export interface ObjectYieldCatalog {
  facility(
    id: string,
  ):
    | { readonly gather?: (GatherSubcategorySource & { readonly mode?: string | undefined }) | undefined }
    | undefined;
  gatherLadder(gather: GatherSubcategorySource): readonly (readonly string[])[];
  readonly gatherBands: readonly GatherBand[];
  /** 아이템의 중분류 ID(없으면 undefined) */
  subcategoryOf(item: string): string | undefined;
  /** 아이템 티어(없으면 undefined) */
  itemTier(item: string): number | undefined;
}

export interface ObjectYieldInput {
  readonly unitId: number;
  readonly objectId: number;
  /** 같은 유닛·오브젝트에서 몇 번째 캐기인가(시드를 바꾼다) */
  readonly seq: number;
  /** 캐는 유닛의 주·보조 스탯 값 */
  readonly primary: number;
  readonly secondary: number;
  /** 맡는 시설 반경 안이면 그 시설 레벨(없으면 1 — 레벨 보너스 0) */
  readonly level: number;
  /** 시설 레벨당 유효 스탯 보너스(설정 칸 N43) */
  readonly levelBonus: number;
}

/** 오브젝트 규칙(굴림 입력) */
export type ObjectRoll = LotRoll;

/** 시드(유닛·오브젝트·차례만으로) */
function yieldSeed(input: ObjectYieldInput): number {
  return mix32(
    Math.imul(input.unitId >>> 0, 0x9e37_79b1) ^
      mix32((input.objectId >>> 0) ^ Math.imul(input.seq >>> 0, 0x85eb_ca6b)),
  );
}

const itemAsset = (id: string): string => `item:${id}`;
const clampTier = (tier: number): number => Math.max(0, Math.min(GATHER_TIERS - 1, Math.trunc(tier)));

/**
 * 오브젝트의 굴림 규칙(머리 주석): 사다리 = 맡는 시설 사다리(대표 아이템이 그 사다리 중분류에 들 때) 또는 대표 아이템 중분류 사다리. 대표 아이템이
 * 사다리에 없으면(꺼진 아이템 등) 그 티어 칸에 넣는다 — 범위 없는 오브젝트가 옛 고정 아이템을 그대로 낸다. 범위 = tierRange, 없으면 대표 아이템 티어
 */
export function objectRollOf(
  kind: Pick<GatherKind, "item" | "table" | "facility" | "tierRange" | "itemWeights">,
  catalog: ObjectYieldCatalog,
): ObjectRoll {
  const prefer = itemAsset(kind.item);
  const gather = kind.facility === null ? undefined : catalog.facility(kind.facility)?.gather;
  const sub = catalog.subcategoryOf(kind.item);
  const base =
    gather && sub !== undefined && gatherSubcategories(gather).includes(sub)
      ? catalog.gatherLadder(gather)
      : sub !== undefined
        ? catalog.gatherLadder({ subcategory: sub })
        : Array.from({ length: GATHER_TIERS }, (): string[] => []);
  const tier = clampTier(catalog.itemTier(kind.item) ?? 0);
  const ladder = base[tier]?.includes(prefer)
    ? base
    : base.map((choices, t) => (t === tier ? [...choices, prefer] : choices));
  const range = kind.tierRange ?? { min: tier, max: tier };
  const table =
    kind.table && kind.table.length > 0
      ? kind.table.map((row) => ({ asset: itemAsset(row.item), weightPm: row.weightPm }))
      : undefined;
  const weights =
    kind.itemWeights && kind.itemWeights.length > 0 && !table
      ? new Map(kind.itemWeights.map((row) => [itemAsset(row.item), Math.max(0, row.weight)]))
      : undefined;
  return {
    ladder,
    tierRange: { min: clampTier(range.min), max: clampTier(Math.max(range.min, range.max)) },
    prefer,
    ...(weights ? { weights } : {}),
    ...(table ? { table } : {}),
  };
}

/** 한 번 캘 때 나오는 아이템 ID(item: 앞머리 없음). 아무것도 고르지 못하면 대표 아이템 */
export function objectYieldItem(
  kind: Pick<GatherKind, "item" | "table" | "facility" | "tierRange" | "itemWeights">,
  catalog: ObjectYieldCatalog,
  input: ObjectYieldInput,
): string {
  const roll = objectRollOf(kind, catalog);
  const primary = Math.max(0, input.primary);
  const secondary = Math.max(0, input.secondary);
  const result = rollGatherOutputs(
    {
      ladder: roll.ladder,
      bands: catalog.gatherBands,
      stat: gatherStat(primary + secondary, Math.max(1, input.level), input.levelBonus),
      lots: 1,
      lotSize: new Map(),
      tierRange: roll.tierRange,
      prefer: roll.prefer,
      weights: roll.weights,
      table: roll.table,
    },
    createRng(yieldSeed(input)),
  );
  const asset = result.outputs[0]?.asset;
  return asset === undefined ? kind.item : asset.replace(/^item:/, "");
}
