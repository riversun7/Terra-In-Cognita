// 구간 조절 판(/dev/gather-tiers) — 고른 유효 스탯 구간의 티어 확률을 분포 막대로 바로 만진다(docs/adr/2026-11-10-editor-input-controls.md).
// 공용 DistributionControl: 쌓은 막대의 경계 끌기, 티어마다 막대·값·잠금, 균등·정규화·팩 값으로. 합은 늘 1000‰이라 [적용]이 산수로 막히지 않는다.
// 결과 읽기: 평균 티어(팩 값과 견줌), 권장 최고 티어를 넘는 몫. 끄는 동안 바로 바뀐다. 구간은 고르기 칸·◀▶로 옮긴다(표의 [조절]도 같다).
import {
  type BuildingEditorGatherBand,
  GATHER_BAND_WEIGHT_TOTAL,
  GATHER_TIER_SLOTS,
} from "@terra/shared/buildingEditor";
import { useId } from "react";
import { m } from "../../paraglide/messages.js";
import { DistributionControl, type DistributionPart } from "../content/contentEditorDistribution.tsx";
import { shareText } from "../content/contentEditorNumeric.ts";
import {
  type GatherStage,
  ROW_PRESETS,
  type RowPreset,
  averageTierText,
  draftBandOf,
  maxAccessTierOf,
  overTierSum,
  rowPresetWeights,
} from "./gatherTierModel.ts";
import { ROW_PRESET_TEXT, TIER_TEXT } from "./gatherTierText.ts";

const TIERS = Array.from({ length: GATHER_TIER_SLOTS }, (_, tier) => tier);
const isRowPreset = (value: string): value is RowPreset => ROW_PRESETS.some((preset) => preset === value);

/** 구간 글("0~19", 마지막은 "220+") */
export function bandRangeText(bands: readonly BuildingEditorGatherBand[], index: number): string {
  const from = bands[index]?.entry.from ?? 0;
  const next = bands[index + 1]?.entry.from;
  return next === undefined
    ? m.dev_gather_stat_from({ from })
    : m.dev_gather_stat_range({ from, to: next - 1 });
}

export function GatherBandPanel({
  bands,
  stage,
  selected,
  onSelect,
  onEdit,
  onRevert,
  onUnstage,
}: {
  bands: readonly BuildingEditorGatherBand[];
  stage: GatherStage;
  /** 고른 구간 ID(없거나 모르는 값이면 첫 구간) */
  selected: string | null;
  onSelect: (id: string) => void;
  onEdit: (row: BuildingEditorGatherBand, weights: readonly number[]) => void;
  onRevert: (row: BuildingEditorGatherBand) => void;
  onUnstage: (id: string) => void;
}) {
  const selectId = useId();
  const found = bands.findIndex((band) => band.entry.id === selected);
  const index = found < 0 ? 0 : found;
  const row = bands[index];
  if (!row) return null;
  const id = row.entry.id;
  const draft = draftBandOf(row, stage);
  const staged = stage.bands.get(id);
  const maxTier = maxAccessTierOf(draft.from, bands[index + 1]?.entry.from);
  const range = bandRangeText(bands, index);
  const parts: DistributionPart[] = TIERS.map((tier) => ({
    key: `t${tier}`,
    label: `T${tier}`,
    tone: tier,
    dim: tier > maxTier,
  }));
  const step = (offset: -1 | 1): void => {
    const next = bands[index + offset];
    if (next) onSelect(next.entry.id);
  };
  return (
    <section
      className="ce-panel gt-panel"
      aria-labelledby="gt-panel-title"
      data-band-id={id}
      data-staged={staged ? "" : undefined}
    >
      <div className="gt-panel-head">
        <h2 id="gt-panel-title" className="ce-panel-title">
          {m.dev_gather_panel_title()}
        </h2>
        <span className="gt-panel-pick">
          <button
            type="button"
            className="button-small gt-panel-prev"
            aria-label={m.dev_gather_prev_band()}
            title={m.dev_gather_prev_band()}
            aria-disabled={index === 0 || undefined}
            onClick={() => step(-1)}
          >
            <span aria-hidden="true">◀</span>
          </button>
          <label className="visually-hidden" htmlFor={selectId}>
            {m.dev_gather_panel_band()}
          </label>
          <select
            id={selectId}
            className="gt-panel-select"
            value={id}
            onChange={(event) => onSelect(event.target.value)}
          >
            {bands.map((band, at) => (
              <option key={band.entry.id} value={band.entry.id}>
                {m.dev_gather_band_option({ range: bandRangeText(bands, at) })}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="button-small gt-panel-next"
            aria-label={m.dev_gather_next_band()}
            title={m.dev_gather_next_band()}
            aria-disabled={index === bands.length - 1 || undefined}
            onClick={() => step(1)}
          >
            <span aria-hidden="true">▶</span>
          </button>
        </span>
        <span className="gt-panel-meta">
          <code className="dev-code" translate="no">
            {id}
          </code>{" "}
          {m.dev_gather_recommend({ tier: maxTier })}
        </span>
        <span className="gt-panel-actions">
          {row.origin === "edited" && staged?.op !== "revert_gather_band" ? (
            <button type="button" className="button-small gt-revert" onClick={() => onRevert(row)}>
              {m.dev_buildings_revert()}
            </button>
          ) : null}
          {staged ? (
            <button type="button" className="button-small gt-unstage" onClick={() => onUnstage(id)}>
              {m.dev_buildings_unstage()}
            </button>
          ) : null}
        </span>
      </div>
      <DistributionControl
        // 구간을 바꾸면 잠금을 푼다
        key={id}
        label={m.dev_gather_band_option({ range })}
        parts={parts}
        values={draft.weightsPm}
        total={GATHER_BAND_WEIGHT_TOTAL}
        pack={row.pack?.weightsPm}
        evenParts={new Set(TIERS.filter((tier) => tier <= maxTier))}
        onChange={(next) => onEdit(row, next)}
        renderReadout={(values) => {
          const over = overTierSum(values, maxTier);
          return (
            <>
              <strong className="gt-avg" data-avg={averageTierText(values)}>
                {m.dev_gather_avg_tier({ value: averageTierText(values) })}
              </strong>
              {row.pack ? (
                <span className="dev-muted">
                  {m.dev_gather_avg_pack({ value: averageTierText(row.pack.weightsPm) })}
                </span>
              ) : null}
              <span className="gt-over" data-over={over > 0 ? "" : undefined}>
                {m.dev_gather_over_tier({
                  tier: maxTier,
                  share: shareText(over, GATHER_BAND_WEIGHT_TOTAL),
                })}
              </span>
            </>
          );
        }}
        tools={
          <select
            className="gt-preset"
            aria-label={m.dev_gather_row_preset({ band: range })}
            value=""
            onChange={(event) => {
              const kind = event.target.value;
              if (isRowPreset(kind)) onEdit(row, rowPresetWeights(kind, maxTier));
            }}
          >
            <option value="">{m.dev_gather_row_preset_pick()}</option>
            {ROW_PRESETS.map((kind) => (
              <option key={kind} value={kind}>
                {ROW_PRESET_TEXT[kind]()}
              </option>
            ))}
          </select>
        }
      />
      <p className="gt-tier-names">
        {TIERS.map((tier) => (
          <span key={tier} className="gt-tier-name" data-tone={tier}>
            {TIER_TEXT[tier]?.()}
          </span>
        ))}
      </p>
    </section>
  );
}
