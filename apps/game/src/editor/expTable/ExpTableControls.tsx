// 유닛 경험치 테이블 편집기 곡선 생성기 · 활동 속도 시뮬레이터 패널(/dev/exp-table)
import type { ExpTableEntryJson } from "@terra/shared/expTable";
import { m } from "../../paraglide/messages.js";
import { fmtDecimal, fmtInt } from "./expTableFormat.ts";
import type { ActivityProfileId, ExpCurveParams, ExpCurvePresetId } from "./expTableModel.ts";

interface ExpTableControlsProps {
  readonly baseCapLevel: number;
  readonly maxLevel: number;
  readonly curveParams: ExpCurveParams;
  readonly activePreset: ExpCurvePresetId | null;
  readonly curvePreview: readonly ExpTableEntryJson[];
  readonly onPreset: (id: ExpCurvePresetId) => void;
  readonly onChangeCurve: (patch: Partial<ExpCurveParams>) => void;
  readonly onStageCurve: () => void;
  readonly activityId: ActivityProfileId | null;
  readonly xpPerHour: number;
  readonly hoursPerDay: number;
  readonly dailyXp: number;
  readonly focusLevel: number;
  readonly onSelectActivity: (id: ActivityProfileId) => void;
  readonly onChangeXpPerHour: (value: number) => void;
  readonly onChangeHoursPerDay: (value: number) => void;
  readonly onFocusLevel: (level: number) => void;
  readonly locale: string;
}

export function ExpTableControls({
  baseCapLevel,
  maxLevel,
  curveParams,
  activePreset,
  curvePreview,
  onPreset,
  onChangeCurve,
  onStageCurve,
  activityId,
  xpPerHour,
  hoursPerDay,
  dailyXp,
  focusLevel,
  onSelectActivity,
  onChangeXpPerHour,
  onChangeHoursPerDay,
  onFocusLevel,
  locale,
}: ExpTableControlsProps) {
  return (
    <div className="exp-controls-grid">
      <section className="exp-panel" aria-label={m.dev_exp_builder_title()}>
        <div className="exp-panel-head">
          <h2>{m.dev_exp_builder_title()}</h2>
          <p className="field-hint">{m.dev_exp_builder_desc()}</p>
        </div>

        <div className="exp-pills">
          {(
            [
              ["balanced", m.dev_exp_preset_balanced()],
              ["relaxed", m.dev_exp_preset_relaxed()],
              ["fast", m.dev_exp_preset_fast()],
              ["legacy", m.dev_exp_preset_legacy()],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="exp-pill"
              aria-pressed={activePreset === id}
              onClick={() => onPreset(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="exp-slider-list">
          <label className="exp-slider-row">
            <span className="exp-slider-label">
              <span>{m.dev_exp_field_base_total({ cap: baseCapLevel })}</span>
              <span className="exp-mono">{fmtInt(curveParams.totalToBaseCap, locale)} XP</span>
            </span>
            <div className="exp-slider-inputs">
              <input
                type="range"
                min={100_000}
                max={5_000_000}
                step={25_000}
                value={curveParams.totalToBaseCap}
                onChange={(e) => onChangeCurve({ totalToBaseCap: Number(e.target.value) })}
              />
              <input
                type="number"
                className="input exp-num-input"
                min={10_000}
                max={100_000_000}
                step={10_000}
                value={curveParams.totalToBaseCap}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 10_000) onChangeCurve({ totalToBaseCap: Math.round(v) });
                }}
              />
            </div>
          </label>

          <label className="exp-slider-row">
            <span className="exp-slider-label">
              <span>{m.dev_exp_field_base_exp({ cap: baseCapLevel })}</span>
              <span className="exp-mono">Lv^{fmtDecimal(curveParams.baseExponent, locale, 2)}</span>
            </span>
            <div className="exp-slider-inputs">
              <input
                type="range"
                min={1.0}
                max={3.5}
                step={0.05}
                value={curveParams.baseExponent}
                onChange={(e) => onChangeCurve({ baseExponent: Number(e.target.value) })}
              />
              <input
                type="number"
                className="input exp-num-input exp-num-input-sm"
                min={0.5}
                max={4.0}
                step={0.05}
                value={curveParams.baseExponent}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 0.5 && v <= 4.0) onChangeCurve({ baseExponent: v });
                }}
              />
            </div>
          </label>

          <label className="exp-slider-row">
            <span className="exp-slider-label">
              <span>{m.dev_exp_field_prestige_ratio({ cap: baseCapLevel, max: maxLevel })}</span>
              <span className="exp-mono">{curveParams.prestigeRatioPct}%</span>
            </span>
            <div className="exp-slider-inputs">
              <input
                type="range"
                min={25}
                max={250}
                step={5}
                value={curveParams.prestigeRatioPct}
                onChange={(e) => onChangeCurve({ prestigeRatioPct: Number(e.target.value) })}
              />
              <input
                type="number"
                className="input exp-num-input exp-num-input-sm"
                min={10}
                max={500}
                step={5}
                value={curveParams.prestigeRatioPct}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 10 && v <= 500) {
                    onChangeCurve({ prestigeRatioPct: Math.round(v) });
                  }
                }}
              />
            </div>
          </label>

          <label className="exp-slider-row">
            <span className="exp-slider-label">
              <span>{m.dev_exp_field_prestige_exp({ cap: baseCapLevel, max: maxLevel })}</span>
              <span className="exp-mono">{fmtDecimal(curveParams.prestigeExponent, locale, 2)}</span>
            </span>
            <div className="exp-slider-inputs">
              <input
                type="range"
                min={0.5}
                max={3.0}
                step={0.1}
                value={curveParams.prestigeExponent}
                onChange={(e) => onChangeCurve({ prestigeExponent: Number(e.target.value) })}
              />
              <input
                type="number"
                className="input exp-num-input exp-num-input-sm"
                min={0.3}
                max={4.0}
                step={0.1}
                value={curveParams.prestigeExponent}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 0.3 && v <= 4.0) onChangeCurve({ prestigeExponent: v });
                }}
              />
            </div>
          </label>
        </div>

        <div className="exp-builder-footer">
          <p className="exp-preview-text">
            {m.dev_exp_curve_preview({
              first: fmtInt(curvePreview[0]?.requiredExp ?? 0, locale),
              capMinus: baseCapLevel - 1,
              cap: baseCapLevel,
              mid: fmtInt(curvePreview[baseCapLevel - 2]?.requiredExp ?? 0, locale),
              maxMinus: maxLevel - 1,
              max: maxLevel,
              last: fmtInt(curvePreview[curvePreview.length - 1]?.requiredExp ?? 0, locale),
            })}
          </p>
          <button type="button" className="button-primary" onClick={onStageCurve}>
            {m.dev_exp_btn_apply_curve()}
          </button>
        </div>
      </section>

      <section className="exp-panel" aria-label={m.dev_exp_sim_title()}>
        <div className="exp-panel-head">
          <h2>{m.dev_exp_sim_title()}</h2>
          <p className="field-hint">{m.dev_exp_sim_desc()}</p>
        </div>

        <div className="exp-pills">
          {(
            [
              ["gather_npc", m.dev_exp_act_gather()],
              ["casual", m.dev_exp_act_casual()],
              ["training", m.dev_exp_act_training()],
              ["combat", m.dev_exp_act_combat()],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="exp-pill"
              aria-pressed={activityId === id}
              onClick={() => onSelectActivity(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="exp-inline-fields">
          <label className="exp-field">
            <span>{m.dev_exp_field_xp_hour()}</span>
            <input
              type="number"
              className="input"
              min={10}
              max={100_000}
              step={50}
              value={xpPerHour}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 10) onChangeXpPerHour(Math.round(v));
              }}
            />
          </label>

          <label className="exp-field">
            <span>{m.dev_exp_field_hours_day()}</span>
            <input
              type="number"
              className="input"
              min={1}
              max={24}
              step={1}
              value={hoursPerDay}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 1 && v <= 24) onChangeHoursPerDay(v);
              }}
            />
          </label>
        </div>

        <p className="exp-meta">{m.dev_exp_field_daily_xp({ xp: fmtInt(dailyXp, locale) })}</p>

        <label className="exp-slider-row">
          <span className="exp-slider-label">
            <span>{m.dev_exp_field_focus_lv()}</span>
            <span className="exp-mono">
              Lv {focusLevel} → {focusLevel + 1}
            </span>
          </span>
          <div className="exp-slider-inputs">
            <input
              type="range"
              min={1}
              max={Math.max(1, maxLevel - 1)}
              step={1}
              value={focusLevel}
              onChange={(e) => onFocusLevel(Number(e.target.value))}
            />
          </div>
        </label>
      </section>
    </div>
  );
}
