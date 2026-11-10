// 1차 생산 티어 확률 행렬(/dev/gather-tiers) — 줄 = 유효 스탯 구간, 칸 = T0~T9 가중치(‰), 평균 티어·분포 막대·[조절]. 공용 .dev-table.
// 칸마다 지금 값과 다르면 담음 띠(data-staged), 팩 값과 다르면 경고 띠(data-changed, 팩 값은 title). 키: ↑↓ = 위·아래 구간의 같은 티어 칸.
// 옛 프로젝트(AntiGravt01 /admin/editor/production skill-prob 탭)의 카드 열두 장을 한 표로 모았다(같은 값·프리셋, 한 화면에 다 보인다).
// 2026-11-10(docs/adr/2026-11-10-editor-input-controls.md): 칸에 값을 치면 같은 구간의 나머지가 지금 몫대로 따라 움직여 합이 늘 1000‰이다
// (한 구간에서 잇달아 친 칸은 그대로 둔다 — 줄을 처음부터 쳐 넣을 수 있게). 머리 아래 줄 = 티어마다 구간별 곡선(작은 막대).
// 칸을 여러 개 골라(Shift·Ctrl+누름, 머리 = 열 전체) 한꺼번에 바꾸거나(값으로·더하기·곱하기·선형·등비 채우기) 모서리를 끌어 아래로 채운다.
// 줄의 [조절]은 그 구간을 위 판(GatherBandPanel: 분포 막대)에 올린다.
import {
  type BuildingEditorGatherBand,
  GATHER_BAND_WEIGHT_TOTAL,
  GATHER_TIER_SLOTS,
} from "@terra/shared/buildingEditor";
import { type KeyboardEvent, useRef } from "react";
import { m } from "../../paraglide/messages.js";
import { GridBulkBar, Sparkline, useGridSelection } from "../content/contentEditorGrid.tsx";
import { type BulkOp, pickedByColumn } from "../content/contentEditorNumeric.ts";
import { bandRangeText } from "./GatherBandPanel.tsx";
import {
  type GatherStage,
  averageTierText,
  balancedWeights,
  draftBandOf,
  maxAccessTierOf,
  weightSum,
} from "./gatherTierModel.ts";
import { TIER_TEXT } from "./gatherTierText.ts";

const TIERS = Array.from({ length: GATHER_TIER_SLOTS }, (_, tier) => tier);

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
  selected,
  onSelect,
  onEdit,
  onBulk,
}: {
  bands: readonly BuildingEditorGatherBand[];
  stage: GatherStage;
  /** 위 판에 올린 구간 ID */
  selected: string | null;
  onSelect: (id: string) => void;
  onEdit: (row: BuildingEditorGatherBand, weights: readonly number[]) => void;
  /** 고른 칸(열쇠 "줄:티어") 묶음 바꾸기 */
  onBulk: (picked: Iterable<string>, op: BulkOp) => void;
}) {
  const grid = useGridSelection();
  // 한 구간을 치는 동안: 칸에 초점이 올 때의 묶음(base)과 그 구간에서 이미 친 칸(typed — 다음 칸을 쳐도 그대로 둔다)
  const session = useRef<{ row: number; tier: number; base: readonly number[]; typed: Set<number> } | null>(
    null,
  );
  const drafts = bands.map((row) => draftBandOf(row, stage));
  const canFill = [...pickedByColumn(grid.picked).values()].some((rows) => rows.length >= 2);
  return (
    <>
      <GridBulkBar
        className="gt-bulkbar"
        count={grid.picked.size}
        limits={{ min: 0, max: GATHER_BAND_WEIGHT_TOTAL }}
        unit="‰"
        canFill={canFill}
        onApply={(op) => onBulk(grid.picked, op)}
        onClear={grid.clear}
      />
      <div className="dev-table-wrap gt-table-wrap">
        <table className="dev-table gt-table">
          <caption className="visually-hidden">{m.dev_gather_table_caption()}</caption>
          <thead>
            <tr>
              <th scope="col">{m.dev_gather_col_band()}</th>
              {TIERS.map((tier) => (
                <th key={tier} scope="col" className="gt-tier-head" data-tier={`t${tier}`}>
                  <button
                    type="button"
                    className="ce-col-pick"
                    title={TIER_TEXT[tier]?.()}
                    aria-label={m.dev_grid_select_column({ name: `T${tier}` })}
                    onClick={() => grid.pickColumn(tier, bands.length)}
                  >
                    T{tier}
                  </button>
                </th>
              ))}
              <th scope="col" className="gt-num">
                {m.dev_gather_col_avg()}
              </th>
              <th scope="col">{m.dev_gather_col_bar()}</th>
            </tr>
            <tr className="gt-curves">
              <th scope="row">{m.dev_gather_curve_row()}</th>
              {TIERS.map((tier) => (
                <td key={tier} className="gt-curve" data-tier={`t${tier}`}>
                  <Sparkline
                    name={`T${tier}`}
                    tone={tier}
                    values={drafts.map((draft) => draft.weightsPm[tier] ?? 0)}
                  />
                </td>
              ))}
              <td />
              <td />
            </tr>
          </thead>
          <tbody>
            {bands.map((row, index) => {
              const id = row.entry.id;
              const draft = drafts[index] ?? row.entry;
              const staged = stage.bands.get(id);
              const maxTier = maxAccessTierOf(draft.from, bands[index + 1]?.entry.from);
              const sum = weightSum(draft.weightsPm);
              const sumOk = sum === GATHER_BAND_WEIGHT_TOTAL;
              const range = bandRangeText(bands, index);
              const picked = selected === id;
              return (
                <tr
                  key={id}
                  data-band-id={id}
                  data-staged={staged ? "" : undefined}
                  data-changed={row.origin === "edited" ? "" : undefined}
                  data-selected={picked ? "" : undefined}
                >
                  <th scope="row" className="gt-band">
                    <button
                      type="button"
                      className="gt-adjust"
                      aria-pressed={picked}
                      aria-label={m.dev_gather_adjust_named({ band: range })}
                      title={m.dev_gather_adjust_named({ band: range })}
                      onClick={() => onSelect(id)}
                    >
                      <span className="gt-range">{range}</span>
                      <span className="gt-band-meta">{m.dev_gather_recommend({ tier: maxTier })}</span>
                    </button>
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
                        {...grid.cellProps(index, tier)}
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
                          data-num=""
                          data-row={index}
                          data-tier={tier}
                          aria-label={m.dev_gather_weight_label({ band: range, tier })}
                          title={changed ? m.dev_gather_cell_pack({ value: pack }) : undefined}
                          onKeyDown={(event) => moveVertical(event, index, tier)}
                          onFocus={(event) => {
                            event.currentTarget.select();
                            const before = session.current;
                            session.current = {
                              row: index,
                              tier,
                              base: draft.weightsPm,
                              typed: before?.row === index ? before.typed : new Set(),
                            };
                          }}
                          onChange={(event) => {
                            const digits = event.target.value.replace(/[^\d]/g, "");
                            const parsed = digits === "" ? 0 : Number.parseInt(digits, 10);
                            if (Number.isNaN(parsed)) return;
                            const now = session.current;
                            const base = now?.row === index && now.tier === tier ? now.base : draft.weightsPm;
                            const held = new Set(now?.row === index ? now.typed : []);
                            held.delete(tier);
                            now?.typed.add(tier);
                            onEdit(row, balancedWeights(base, tier, parsed, held));
                          }}
                        />
                        {grid.fillHandle(index, tier, (from, to, col) => {
                          const source = drafts[from]?.weightsPm[col] ?? 0;
                          const rows = Array.from(
                            { length: Math.abs(to - from) + 1 },
                            (_, step) => Math.min(from, to) + step,
                          );
                          onBulk(
                            rows.map((at) => `${at}:${col}`),
                            { kind: "set", value: source },
                          );
                        })}
                      </td>
                    );
                  })}
                  <td className="gt-num">
                    {sumOk ? (
                      <span className="gt-avg-cell">T{averageTierText(draft.weightsPm)}</span>
                    ) : (
                      <span className="gt-sum" data-invalid="">
                        {m.dev_gather_sum_bad({ sum })}
                      </span>
                    )}
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="ce-input-keys gt-matrix-hint">{m.dev_gather_matrix_hint()}</p>
    </>
  );
}
