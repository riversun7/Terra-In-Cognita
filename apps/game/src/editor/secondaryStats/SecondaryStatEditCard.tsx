// 선택한 2차 스탯(가중치·기본값·상한·반감) 또는 파생 전투식 편집 카드.
import { FORMULA_FUNCTION_NAMES, type FormulaIssue, statFormulaKey } from "@terra/shared/formula";
import { PRIMARY_STATS } from "@terra/shared/roster";
import { STAT_CELL_LIMITS, type StatCellField } from "@terra/shared/tuning";
import { type ChangeEvent, useId, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { NumberControl } from "../content/contentEditorNumber.tsx";
import { cellFieldText, primaryCode, primaryName } from "./secondaryStatsMessages.ts";
import {
  type SecondaryDraftState,
  type TargetEntry,
  effectiveCellValues,
  formulaSlotDefOf,
  hasTargetChanges,
  statRowModeOf,
  targetFormulaSourceOf,
  validateTargetFormula,
} from "./secondaryStatsModel.ts";

interface Props {
  readonly target: TargetEntry;
  readonly drafts: SecondaryDraftState;
  readonly locale: string;
  readonly onCellChange: (key: string, value: number | null) => void;
  readonly onFormulaChange: (key: string, source: string | null) => void;
  readonly onRevertTarget: () => void;
}

function formatIssues(issues: readonly FormulaIssue[]): string[] {
  return issues.map((issue) => `@${issue.s + 1}: ${issue.code}${issue.name ? ` (${issue.name})` : ""}`);
}

/** 개별 가중치/기본값/상한/반감 칸 편집 줄(NumberControl 래퍼) */
function StatCellEditor({
  rowId,
  field,
  value,
  pack,
  changed,
  staged,
  onChange,
}: {
  rowId: string;
  field: StatCellField;
  value: number;
  pack: number;
  changed: boolean;
  staged: boolean;
  onChange: (value: number | null) => void;
}) {
  const inputId = useId();
  const limits = STAT_CELL_LIMITS[field];
  const shown = String(value);
  const [text, setText] = useState(shown);
  const [seen, setSeen] = useState(shown);
  if (seen !== shown) {
    setSeen(shown);
    setText(shown);
  }
  const isPrimary = (PRIMARY_STATS as readonly string[]).includes(field);
  const label = cellFieldText(field);

  return (
    <div
      className="sec-cell"
      data-cell-key={`${rowId}.${field}`}
      data-stat={isPrimary ? field : undefined}
      data-changed={changed ? "" : undefined}
      data-staged={staged ? "" : undefined}
    >
      <div className="sec-cell-head">
        <label htmlFor={inputId} className="sec-cell-label">
          {isPrimary ? <span className="sec-stat-dot" data-stat={field} aria-hidden="true" /> : null}
          <span>{label}</span>
        </label>
        <span className="sec-cell-pack">pack {pack}</span>
      </div>
      <NumberControl
        id={inputId}
        label={label}
        text={text}
        value={value}
        min={limits.min}
        max={limits.max}
        pack={pack}
        inputClassName="sec-cell-input"
        onText={(next) => {
          setText(next);
          const parsed = Number(next.replaceAll(/[\s,_]/g, ""));
          if (Number.isSafeInteger(parsed) && parsed >= limits.min && parsed <= limits.max) {
            onChange(parsed);
          }
        }}
        onAdjust={(next) => {
          setText(String(next));
          onChange(next);
        }}
        inputProps={{
          onBlur: () => setText(shown),
        }}
      />
    </div>
  );
}

export function SecondaryStatEditCard({
  target,
  drafts,
  locale,
  onCellChange,
  onFormulaChange,
  onRevertTarget,
}: Props) {
  const areaId = useId();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const name = locale === "en" ? target.name.en : target.name.ko;
  const dirty = hasTargetChanges(target, drafts);

  const statMode =
    target.kind === "stat" ? statRowModeOf(target.row, target.slot, drafts.formulaDrafts) : null;
  const showFormulaBox = target.kind === "combat" || statMode !== "weights";
  const formulaKey = target.kind === "stat" ? statFormulaKey(target.row.id) : target.formulaId;
  const displayId = target.kind === "stat" ? target.row.id : target.formulaId;
  const source = targetFormulaSourceOf(target, drafts);
  const parsed = validateTargetFormula(target, source);
  const slotDef = formulaSlotDefOf(target);

  const insertToken = (token: string) => {
    const area = areaRef.current;
    if (!area) {
      onFormulaChange(formulaKey, `${source} ${token}`);
      return;
    }
    const start = area.selectionStart ?? source.length;
    const end = area.selectionEnd ?? source.length;
    const next = `${source.slice(0, start)}${token}${source.slice(end)}`;
    onFormulaChange(formulaKey, next);
    requestAnimationFrame(() => {
      area.focus();
      const pos = start + token.length;
      area.setSelectionRange(pos, pos);
    });
  };

  return (
    <article className="sec-edit-card" aria-label={name}>
      <header className="sec-edit-header">
        <div>
          <h2 className="sec-edit-title">{name}</h2>
          <p className="sec-edit-sub">
            <code className="sec-code">{displayId}</code>
            {statMode ? (
              <span className="sec-mode-badge" data-mode={statMode}>
                {statMode === "weights"
                  ? m.dev_sec_mode_weights()
                  : statMode === "world_formula"
                    ? m.dev_sec_mode_formula()
                    : m.dev_sec_mode_pack_formula()}
              </span>
            ) : null}
          </p>
        </div>
        <div className="sec-edit-actions">
          {target.kind === "stat" ? (
            statMode === "weights" ? (
              <button
                type="button"
                className="button-small"
                onClick={() => onFormulaChange(formulaKey, source)}
              >
                {m.dev_sec_switch_to_formula()}
              </button>
            ) : statMode === "world_formula" ? (
              <button
                type="button"
                className="button-small"
                onClick={() => onFormulaChange(formulaKey, null)}
              >
                {m.dev_sec_switch_to_weights()}
              </button>
            ) : null
          ) : null}
          {dirty ? (
            <button type="button" className="button-small" onClick={onRevertTarget}>
              {m.dev_sec_revert_item()}
            </button>
          ) : null}
        </div>
      </header>

      {!showFormulaBox && target.kind === "stat" ? (
        <div className="sec-weights-body">
          <p className="field-hint">{m.dev_sec_weight_hint()}</p>
          {(() => {
            const values = effectiveCellValues(target.row, drafts.cellDrafts);
            const cellByField = new Map(target.row.cells.map((cell) => [cell.field, cell]));
            const extraFields: StatCellField[] = target.row.shape === "quantity" ? ["base"] : ["cap", "half"];
            return (
              <>
                <div className="sec-cell-grid">
                  {PRIMARY_STATS.map((stat) => {
                    const cell = cellByField.get(stat);
                    if (!cell) return null;
                    const key = `${target.row.id}.${stat}`;
                    const draftVal = drafts.cellDrafts.get(key);
                    return (
                      <StatCellEditor
                        key={key}
                        rowId={target.row.id}
                        field={stat}
                        value={values[stat]}
                        pack={cell.pack}
                        changed={cell.override !== null}
                        staged={draftVal !== undefined}
                        onChange={(next) =>
                          onCellChange(key, next === null || next === cell.value ? null : next)
                        }
                      />
                    );
                  })}
                </div>
                <div className="sec-cell-grid sec-cell-extra">
                  {extraFields.map((field) => {
                    const cell = cellByField.get(field);
                    if (!cell) return null;
                    const key = `${target.row.id}.${field}`;
                    const draftVal = drafts.cellDrafts.get(key);
                    return (
                      <StatCellEditor
                        key={key}
                        rowId={target.row.id}
                        field={field}
                        value={values[field]}
                        pack={cell.pack}
                        changed={cell.override !== null}
                        staged={draftVal !== undefined}
                        onChange={(next) =>
                          onCellChange(key, next === null || next === cell.value ? null : next)
                        }
                      />
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      ) : (
        <div className="sec-formula-body">
          <p className="field-hint">{m.dev_sec_formula_hint()}</p>
          <div className="sec-palette" aria-label={m.dev_sec_formula_text_label()}>
            {slotDef.vars.map((v) => (
              <button
                key={v.name}
                type="button"
                className="sec-token-btn"
                onClick={() => insertToken(v.name)}
              >
                {v.name}
              </button>
            ))}
            {FORMULA_FUNCTION_NAMES.map((fn) => (
              <button
                key={fn}
                type="button"
                className="sec-token-btn sec-token-fn"
                onClick={() => insertToken(`${fn}(`)}
              >
                {fn}()
              </button>
            ))}
          </div>
          <label className="visually-hidden" htmlFor={areaId}>
            {m.dev_sec_formula_text_label()}
          </label>
          <textarea
            id={areaId}
            ref={areaRef}
            className="input sec-formula-input"
            rows={4}
            spellCheck={false}
            aria-invalid={!parsed.ok}
            value={source}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              onFormulaChange(formulaKey, event.target.value)
            }
          />
          {!parsed.ok ? (
            <ul className="field-error sec-issue-list" role="alert">
              {formatIssues(parsed.issues).map((text, idx) => (
                <li key={`${text}-${idx}`}>{text}</li>
              ))}
            </ul>
          ) : null}
          <p className="field-hint">
            {PRIMARY_STATS.map((s) => `${primaryCode(s)}=${primaryName(s)}`).join(" · ")}
          </p>
        </div>
      )}
    </article>
  );
}
