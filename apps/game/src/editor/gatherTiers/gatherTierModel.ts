// 1차 생산 티어 확률표 모델(/dev/gather-tiers, 기획 49 N43·D-513) — 담은 변경(구간마다 put·revert, 잠든 줄 버리기), 1000‰ 맞추기, 프리셋.
// 서버 묶음은 건물 편집기와 같은 buildings.save(put_gather_band·revert_gather_band·discard_sleeping)다(docs/adr/2026-11-02-building-editor.md
// "바뀜 (2026-11-09)": 건물 편집기 탭을 따로 화면으로 옮김). 계산이 없는 순수 함수만(시험: gatherTierModel.test.ts).
// 건물 편집기 조각(editor/buildings/)을 가져오지 않는다: 가져오면 둘이 같이 쓰는 조각이 미리 캐시 규칙 밖 이름으로 생긴다.
import {
  type BuildingEditorChange,
  type BuildingEditorGatherBand,
  GATHER_BAND_WEIGHT_TOTAL,
  GATHER_TIER_SLOTS,
  type GatherTierJson,
} from "@terra/shared/buildingEditor";

/** 구간 하나의 담은 변경. base·baseHash = 고치기 시작할 때의 실효 구간·해시 */
export type StagedBand =
  | {
      readonly op: "put_gather_band";
      readonly entry: GatherTierJson;
      readonly base: GatherTierJson;
      readonly baseHash: string;
    }
  | { readonly op: "revert_gather_band"; readonly base: GatherTierJson; readonly baseHash: string };

export interface GatherStage {
  readonly bands: ReadonlyMap<string, StagedBand>;
  /** 버릴 잠든 확률표 줄(구간 ID) */
  readonly discard: ReadonlySet<string>;
}

export const EMPTY_GATHER_STAGE: GatherStage = { bands: new Map(), discard: new Set() };

/** 구간 하나의 담음을 바꾼다(null = 뺀다) */
export function stageBand(stage: GatherStage, id: string, next: StagedBand | null): GatherStage {
  const bands = new Map(stage.bands);
  if (next === null) bands.delete(id);
  else bands.set(id, next);
  return { ...stage, bands };
}

/** 잠든 줄 버리기를 담거나 뺀다 */
export function stageGatherDiscard(stage: GatherStage, id: string, on: boolean): GatherStage {
  const discard = new Set(stage.discard);
  if (on) discard.add(id);
  else discard.delete(id);
  return { ...stage, discard };
}

/** 담은 키(구간 ID, 버릴 잠든 줄은 "sleeping/<ID>") */
export function gatherStageKeys(stage: GatherStage): string[] {
  return [...stage.bands.keys(), ...[...stage.discard].map((id) => `sleeping/${id}`)];
}

/** 담은 변경 → 서버 묶음(buildings.save) */
export function gatherChangesOf(stage: GatherStage): BuildingEditorChange[] {
  const changes: BuildingEditorChange[] = [];
  for (const [id, staged] of stage.bands) {
    if (staged.op === "put_gather_band")
      changes.push({ op: "put_gather_band", entry: staged.entry, baseHash: staged.baseHash });
    else changes.push({ op: "revert_gather_band", id, baseHash: staged.baseHash });
  }
  for (const id of stage.discard) changes.push({ op: "discard_sleeping", id, category: "gather_tiers" });
  return changes;
}

const sameWeights = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * 구간 가중치를 고친 담음: 지금 담음(없으면 실효 구간)을 바탕으로 새 가중치를 얹고, 실효 값과 같아지면 담음에서 뺀다
 */
export function editBand(
  stage: GatherStage,
  row: BuildingEditorGatherBand,
  weightsPm: readonly number[],
): GatherStage {
  const id = row.entry.id;
  const current = stage.bands.get(id);
  const base = current ? current.base : row.entry;
  const baseHash = current ? current.baseHash : row.hash;
  const entry: GatherTierJson = { id, from: row.entry.from, weightsPm: [...weightsPm] };
  const same = base.from === entry.from && sameWeights(base.weightsPm, entry.weightsPm);
  return stageBand(stage, id, same ? null : { op: "put_gather_band", entry, base, baseHash });
}

/** 팩 값으로 되돌리기를 담는다 */
export function revertBand(stage: GatherStage, row: BuildingEditorGatherBand): GatherStage {
  const current = stage.bands.get(row.entry.id);
  return stageBand(stage, row.entry.id, {
    op: "revert_gather_band",
    base: current ? current.base : row.entry,
    baseHash: current ? current.baseHash : row.hash,
  });
}

/** 화면에 보일 구간(담은 put이면 그 값, 되돌리기면 팩 값, 아니면 실효 값) */
export function draftBandOf(row: BuildingEditorGatherBand, stage: GatherStage): GatherTierJson {
  const staged = stage.bands.get(row.entry.id);
  if (!staged) return row.entry;
  if (staged.op === "put_gather_band") return staged.entry;
  return row.pack ?? row.entry;
}

/** 가중치 배열(T0~T9)을 합 1000‰ 정수로 맞춘다(나머지는 버린 소수가 큰 칸부터 1씩) */
export function normalizeWeightsPm(raw: readonly number[]): number[] {
  const clean = Array.from({ length: GATHER_TIER_SLOTS }, (_, index) => Math.max(0, raw[index] ?? 0));
  const sum = clean.reduce((acc, val) => acc + val, 0);
  if (sum <= 0) {
    const fallback = Array.from({ length: GATHER_TIER_SLOTS }, () => 0);
    fallback[0] = GATHER_BAND_WEIGHT_TOTAL;
    return fallback;
  }
  const scaled = clean.map((val) => Math.floor((val * GATHER_BAND_WEIGHT_TOTAL) / sum));
  let remainder = GATHER_BAND_WEIGHT_TOTAL - scaled.reduce((acc, val) => acc + val, 0);
  const order = clean
    .map((val, index) => ({ index, frac: (val * GATHER_BAND_WEIGHT_TOTAL) % sum, val }))
    .toSorted((a, b) => b.frac - a.frac || b.val - a.val || a.index - b.index);
  for (let i = 0; i < order.length && remainder > 0; i++) {
    const item = order[i];
    if (!item) continue;
    scaled[item.index] = (scaled[item.index] ?? 0) + 1;
    remainder -= 1;
  }
  return scaled;
}

/** 구간이 권장하는 가장 높은 티어(스탯 20마다 한 티어, 최대 T9) */
export function maxAccessTierOf(from: number, nextFrom: number | undefined): number {
  const maxStat = nextFrom === undefined ? Math.max(from + 20, 240) : nextFrom - 1;
  return Math.min(9, Math.floor(maxStat / 20) + 1);
}

/** 단조감소형 프리셋(12구간 × T0~T9 ‰, 합 1000‰ — 옛 AntiGravt01 기본 행렬) */
const MONOTONIC_MATRIX: readonly (readonly number[])[] = [
  [950, 50, 0, 0, 0, 0, 0, 0, 0, 0],
  [800, 150, 50, 0, 0, 0, 0, 0, 0, 0],
  [650, 220, 100, 30, 0, 0, 0, 0, 0, 0],
  [530, 260, 140, 60, 10, 0, 0, 0, 0, 0],
  [430, 290, 170, 80, 25, 5, 0, 0, 0, 0],
  [350, 280, 200, 110, 40, 15, 5, 0, 0, 0],
  [290, 260, 210, 140, 60, 25, 10, 5, 0, 0],
  [250, 230, 200, 160, 90, 40, 17, 9, 4, 0],
  [223, 210, 200, 170, 110, 50, 23, 10, 4, 0],
  [204, 200, 190, 170, 120, 60, 35, 15, 6, 0],
  [190, 190, 180, 160, 130, 80, 45, 20, 5, 0],
  [195, 180, 170, 160, 130, 80, 40, 25, 15, 5],
];

/** T3 피크 프리셋(12구간 × T0~T9 ‰, 합 1000‰ — 옛 AntiGravt01 T3 피크 행렬) */
const T3_PEAK_MATRIX: readonly (readonly number[])[] = [
  [650, 280, 60, 10, 0, 0, 0, 0, 0, 0],
  [450, 380, 140, 30, 0, 0, 0, 0, 0, 0],
  [280, 400, 240, 70, 10, 0, 0, 0, 0, 0],
  [150, 350, 320, 140, 40, 0, 0, 0, 0, 0],
  [80, 260, 360, 220, 70, 10, 0, 0, 0, 0],
  [50, 150, 300, 320, 140, 30, 10, 0, 0, 0],
  [30, 110, 220, 360, 200, 60, 20, 0, 0, 0],
  [20, 70, 170, 360, 260, 80, 30, 10, 0, 0],
  [20, 50, 140, 360, 300, 80, 30, 15, 5, 0],
  [20, 50, 130, 350, 300, 90, 40, 20, 0, 0],
  [20, 50, 130, 330, 300, 100, 40, 25, 5, 0],
  [30, 70, 150, 320, 270, 90, 40, 20, 9, 1],
];

const LOW_FOCUS_BASE = [1000, 700, 400, 200, 80, 30, 10, 5, 2, 1];

/** 구간 하나 프리셋: 저티어 집중·균등·중간·고티어 집중(권장 최고 티어 위는 0) */
export const ROW_PRESETS = ["low", "even", "mid", "high"] as const;
export type RowPreset = (typeof ROW_PRESETS)[number];

export function rowPresetWeights(kind: RowPreset, maxTier: number): number[] {
  const slots = (pick: (tier: number) => number): number[] =>
    normalizeWeightsPm(Array.from({ length: GATHER_TIER_SLOTS }, (_, t) => (t > maxTier ? 0 : pick(t))));
  if (kind === "low") return slots((t) => LOW_FOCUS_BASE[t] ?? 0);
  if (kind === "even") return slots(() => 100);
  if (kind === "mid") {
    const mid = Math.floor((maxTier + 1) * 0.6);
    return slots((t) => Math.max(5, 100 - Math.abs(t - mid) * 25));
  }
  return slots((t) => (t === maxTier ? 100 : t === maxTier - 1 ? 50 : 10));
}

/** 전체 구간 프리셋 */
export const BULK_PRESETS = ["monotonic", "t3peak", "low", "even", "high", "pack"] as const;
export type BulkPreset = (typeof BULK_PRESETS)[number];

/** 전체 구간 프리셋을 담는다(구간 차례대로 행렬 줄을 쓴다, 줄이 모자라면 마지막 줄) */
export function applyBulkPreset(
  stage: GatherStage,
  bands: readonly BuildingEditorGatherBand[],
  kind: BulkPreset,
): GatherStage {
  let next = stage;
  bands.forEach((band, index) => {
    const maxTier = maxAccessTierOf(band.entry.from, bands[index + 1]?.entry.from);
    const fallback = band.entry.weightsPm;
    const weights =
      kind === "pack"
        ? (band.pack?.weightsPm ?? fallback)
        : kind === "monotonic"
          ? (MONOTONIC_MATRIX[index] ?? MONOTONIC_MATRIX.at(-1) ?? fallback)
          : kind === "t3peak"
            ? (T3_PEAK_MATRIX[index] ?? T3_PEAK_MATRIX.at(-1) ?? fallback)
            : rowPresetWeights(kind, maxTier);
    next = editBand(next, band, weights);
  });
  return next;
}

/** 가중치 칸 하나를 바꾼 배열(0 ~ 1000으로 자른다) */
export function withWeight(weights: readonly number[], tier: number, value: number): number[] {
  const clamped = Math.max(0, Math.min(GATHER_BAND_WEIGHT_TOTAL, Math.round(value)));
  return Array.from({ length: GATHER_TIER_SLOTS }, (_, index) =>
    index === tier ? clamped : (weights[index] ?? 0),
  );
}

/** 가중치 합 */
export const weightSum = (weights: readonly number[]): number =>
  weights.reduce((acc, value) => acc + value, 0);
