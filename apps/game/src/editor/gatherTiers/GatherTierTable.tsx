// 1차 생산 티어 확률 행렬(/dev/gather-tiers) — 줄 = 유효 스탯 구간, 칸 = T0~T9 가중치(‰), 합·분포 막대·줄 동작. 공용 .dev-table.
// 칸마다 지금 값과 다르면 담음 띠(data-staged), 팩 값과 다르면 경고 띠(data-changed, 팩 값은 title). 키: ↑↓ = 위·아래 구간의 같은 티어 칸.
// 옛 프로젝트(AntiGravt01 /admin/editor/production skill-prob 탭)의 카드 열두 장을 한 표로 모았다(같은 값·프리셋, 한 화면에 다 보인다).
import {
  type BuildingEditorGatherBand,
  GATHER_BAND_WEIGHT_TOTAL,
  GATHER_TIER_SLOTS,
} from "@terra/shared/buildingEditor";
import type { KeyboardEvent } from "react";
import { m } from "../../paraglide/messages.js";
import {
  type GatherStage,
  ROW_PRESETS,
  type RowPreset,
  draftBandOf,
  maxAccessTierOf,
  normalizeWeightsPm,
  rowPresetWeights,
  weightSum,
  withWeight,
} from "./gatherTierModel.ts";
import { ROW_PRESET_TEXT, TIER_TEXT } from "./gatherTierText.ts";

const TIERS = Array.from({ length: GATHER_TIER_SLOTS }, (_, tier) => tier);

const isRowPreset = (value: string): value is RowPreset => ROW_PRESETS.some((preset) => preset === value);

/** ↑↓: 위·아래 구간의 같은 티어 칸으로 */
function moveVertical(event: KeyboardEvent<HTMLInputElement>, row: number, tier: number): void {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  const table = event.currentTarget.closest("table");
  const next = table?.querySelector<HTMLInputElement>(
    `input[data-row="${row + (event.key === "ArrowUp" ? -1 : 1)}"][data-tier="${tier}"]`,
  );
  if (!next) return;
  event.preventDefault();
  next.focus();
  next.select();
}

export function GatherTierTable({
  bands,
  stage,
  onEdit,
  onRevert,
  onUnstage,
}: {
  bands: readonly BuildingEditorGatherBand[];
  stage: GatherStage;
  onEdit: (row: BuildingEditorGatherBand, weights: readonly number[]) => void;
  onRevert: (row: BuildingEditorGatherBand) => void;
  onUnstage: (id: string) => void;
}) {
  return (
    <div className="dev-table-wrap gt-table-wrap">
      <table className="dev-table gt-table">
        <caption className="visually-hidden">{m.dev_gather_table_caption()}</caption>
        <thead>
          <tr>
            <th scope="col">{m.dev_gather_col_band()}</th>
            {TIERS.map((tier) => (
              <th
                key={tier}
                scope="col"
                className="gt-tier-head"
                data-tier={`t${tier}`}
                title={TIER_TEXT[tier]?.()}
              >
                T{tier}
              </th>
            ))}
            <th scope="col" className="gt-num">
              {m.dev_gather_col_sum()}
            </th>
            <th scope="col">{m.dev_gather_col_bar()}</th>
            <th scope="col">{m.dev_gather_col_actions()}</th>
          </tr>
        </thead>
        <tbody>
          {bands.map((row, index) => {
            const id = row.entry.id;
            const draft = draftBandOf(row, stage);
            const staged = stage.bands.get(id);
            const nextFrom = bands[index + 1]?.entry.from;
            const maxTier = maxAccessTierOf(draft.from, nextFrom);
            const sum = weightSum(draft.weightsPm);
            const sumOk = sum === GATHER_BAND_WEIGHT_TOTAL;
            const range =
              nextFrom === undefined
                ? m.dev_gather_stat_from({ from: draft.from })
                : m.dev_gather_stat_range({ from: draft.from, to: nextFrom - 1 });
            return (
              <tr
                key={id}
                data-band-id={id}
                data-staged={staged ? "" : undefined}
                data-changed={row.origin === "edited" ? "" : undefined}
              >
                <th scope="row" className="gt-band">
                  <span className="gt-range">{range}</span>
                  <span className="gt-band-meta">
                    <code className="dev-code" translate="no">
                      {id}
                    </code>{" "}
                    {m.dev_gather_recommend({ tier: maxTier })}
                  </span>
                </th>
                {TIERS.map((tier) => {
                  const value = draft.weightsPm[tier] ?? 0;
                  const current = row.entry.weightsPm[tier] ?? 0;
                  const pack = row.pack?.weightsPm[tier];
                  const changed = pack !== undefined && pack !== value;
                  return (
                    <td
                      key={tier}
                      className="gt-cell"
                      data-staged={value === current ? undefined : ""}
                      data-changed={changed ? "" : undefined}
                      data-dim={tier > maxTier && value === 0 ? "" : undefined}
                    >
                      <input
                        className="input gt-input"
                        inputMode="numeric"
                        autoComplete="off"
                        spellCheck={false}
                        value={value}
                        data-row={index}
                        data-tier={tier}
                        aria-label={m.dev_gather_weight_label({ band: range, tier })}
                        title={changed ? m.dev_gather_cell_pack({ value: pack }) : undefined}
                        onKeyDown={(event) => moveVertical(event, index, tier)}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/[^\d]/g, "");
                          const parsed = digits === "" ? 0 : Number.parseInt(digits, 10);
                          if (!Number.isNaN(parsed)) onEdit(row, withWeight(draft.weightsPm, tier, parsed));
                        }}
                      />
                    </td>
                  );
                })}
                <td className="gt-num">
                  <span className="gt-sum" data-invalid={sumOk ? undefined : ""}>
                    {sumOk ? m.dev_gather_sum({ sum }) : m.dev_gather_sum_bad({ sum })}
                  </span>
                </td>
                <td className="gt-bar-cell">
                  <span className="gt-stack" aria-hidden="true">
                    {draft.weightsPm.map((weight, tier) =>
                      weight > 0 && sum > 0 ? (
                        <span
                          // oxlint-disable-next-line react/no-array-index-key -- 티어 차례가 곧 열쇠다(T0~T9 고정)
                          key={tier}
                          className="gt-seg"
                          data-tier={`t${tier}`}
                          style={{ flexGrow: weight }}
                          title={`T${tier} ${((weight / sum) * 100).toFixed(1)}%`}
                        />
                      ) : null,
                    )}
                  </span>
                </td>
                <td className="gt-actions">
                  {sumOk ? null : (
                    <button
                      type="button"
                      className="button-small gt-normalize"
                      onClick={() => onEdit(row, normalizeWeightsPm(draft.weightsPm))}
                    >
                      {m.dev_gather_normalize()}
                    </button>
                  )}
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
                  {row.origin === "edited" && staged?.op !== "revert_gather_band" ? (
                    <button type="button" className="button-small" onClick={() => onRevert(row)}>
                      {m.dev_buildings_revert()}
                    </button>
                  ) : null}
                  {staged ? (
                    <button type="button" className="button-small gt-unstage" onClick={() => onUnstage(id)}>
                      {m.dev_buildings_unstage()}
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
