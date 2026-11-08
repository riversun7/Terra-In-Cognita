// [스탯 영향도] 탭 — docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-08 완전 개편)" 2절.
// 기준 분포에서 1차 하나씩 옮기거나(총합 그대로) 더해(+k) 2차 스탯·전투 사양·기준 상대 승률·전투 시간이 어떻게 바뀌는지 서버가 잰다.
// 결과: 1차 영향 순위 막대(고른 단계), 단계별 곡선, 2차 스탯 변화 표. 시험용 data-*: .an-sensitivity data-status.
import {
  ANALYSIS_DEFAULT_STEPS,
  ANALYSIS_LIMITS,
  ANALYSIS_BUILD_PRESETS,
} from "@terra/shared/balanceAnalysis";
import { PRIMARY_STATS } from "@terra/shared/roster";
import { useMemo, useState } from "react";
import { m } from "../../../paraglide/messages.js";
import { primaryCode, primaryName } from "../balanceMessages.ts";
import { NumberField } from "../lab/fields.tsx";
import type { LabData } from "../lab/useLabData.ts";
import { buildName } from "./analysisMessages.ts";
import {
  RUN_OPTIONS,
  SUM_OPTIONS,
  type SensitivityForm,
  defaultSensitivityForm,
  exportJson,
  isSensitivityForm,
  loadForm,
  parseSteps,
  saveForm,
  sensitivityCsv,
  sensitivityInputOf,
} from "./analysisModel.ts";
import { ConditionsPanel } from "./ConditionsPanel.tsx";
import { JobBar } from "./JobBar.tsx";
import { SensitivityResults } from "./SensitivityResults.tsx";
import { useAnalysisJob } from "./useAnalysisJob.ts";

export function SensitivityTab({ data, locale }: { data: LabData; locale: string }) {
  const [form, setFormState] = useState<SensitivityForm>(
    () => loadForm("sensitivity", isSensitivityForm) ?? defaultSensitivityForm(),
  );
  const [stepsDraft, setStepsDraft] = useState<string | null>(null);
  const setForm = (next: SensitivityForm) => {
    setFormState(next);
    saveForm("sensitivity", next);
  };
  const job = useAnalysisJob("sensitivity");
  const input = useMemo(
    () => sensitivityInputOf(form, data.presets?.presets ?? [], data.teams),
    [form, data.presets, data.teams],
  );
  const result = job.result?.kind === "sensitivity" ? job.result : null;
  const stepsText = form.steps.map((step) => String(step).replace("-", "−")).join(", ");
  const stepsInvalid = stepsDraft !== null && parseSteps(stepsDraft, form.mode === "plus") === null;
  const commitSteps = () => {
    if (stepsDraft === null) return;
    const steps = parseSteps(stepsDraft, form.mode === "plus");
    if (steps) setForm({ ...form, steps });
    setStepsDraft(null);
  };
  const exports = result
    ? {
        csv: sensitivityCsv(result),
        json: exportJson(job.input ?? input, result),
        name: `balance-sensitivity-seed${result.seed}`,
      }
    : null;

  return (
    <div className="an-tab an-sensitivity" data-status={job.job?.state ?? "idle"}>
      <p className="an-lead">{m.dev_an_lead_sensitivity()}</p>
      <div className="an-setup">
        <ConditionsPanel
          form={form.conditions}
          onChange={(conditions) => setForm({ ...form, conditions })}
          data={data}
          locale={locale}
        />
        <fieldset className="an-panel an-base-panel">
          <legend className="an-panel-title">{m.dev_an_base()}</legend>
          <label className="an-field an-field-wide">
            <span className="an-field-label">{m.dev_an_base_preset()}</span>
            <select
              value=""
              onChange={(event) => {
                const preset = ANALYSIS_BUILD_PRESETS.find((entry) => entry.id === event.target.value);
                if (preset) setForm({ ...form, weights: preset.weights });
              }}
            >
              <option value="">{m.dev_an_base_preset_pick()}</option>
              {ANALYSIS_BUILD_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {buildName(preset.id)}
                </option>
              ))}
            </select>
          </label>
          <div className="an-weights">
            {PRIMARY_STATS.map((stat) => (
              <NumberField
                key={stat}
                className="an-weight"
                field={stat}
                label={
                  <span data-stat={stat} className="an-stat-code" title={primaryName(stat)}>
                    {primaryCode(stat)}
                  </span>
                }
                value={form.weights[stat]}
                min={0}
                max={ANALYSIS_LIMITS.weightMax}
                onChange={(value) => setForm({ ...form, weights: { ...form.weights, [stat]: value } })}
              />
            ))}
          </div>
          <div className="an-fields">
            <label className="an-field" data-field="sum">
              <span className="an-field-label">{m.dev_an_sum()}</span>
              <select
                value={String(form.sum)}
                onChange={(event) => setForm({ ...form, sum: Number(event.target.value) })}
              >
                {[...new Set([...SUM_OPTIONS, form.sum])]
                  .toSorted((a, b) => a - b)
                  .map((sum) => (
                    <option key={sum} value={String(sum)}>
                      {sum}
                    </option>
                  ))}
              </select>
            </label>
            <label className="an-field an-field-wide" data-field="mode">
              <span className="an-field-label">{m.dev_an_sens_mode()}</span>
              <select
                value={form.mode}
                onChange={(event) => {
                  const mode = event.target.value === "plus" ? "plus" : "shift";
                  setStepsDraft(null);
                  setForm({ ...form, mode, steps: [...ANALYSIS_DEFAULT_STEPS[mode]] });
                }}
              >
                <option value="shift">{m.dev_an_sens_shift()}</option>
                <option value="plus">{m.dev_an_sens_plus()}</option>
              </select>
            </label>
            <label className="an-field an-field-wide">
              <span className="an-field-label">{m.dev_an_steps()}</span>
              <input
                className="input an-steps"
                inputMode="text"
                autoComplete="off"
                value={stepsDraft ?? stepsText}
                aria-invalid={stepsInvalid || undefined}
                title={m.dev_an_steps_hint({ max: ANALYSIS_LIMITS.stepsMax })}
                onChange={(event) => setStepsDraft(event.target.value)}
                onBlur={commitSteps}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitSteps();
                  if (event.key === "Escape") setStepsDraft(null);
                }}
              />
              <span className="an-hint">{m.dev_an_steps_hint({ max: ANALYSIS_LIMITS.stepsMax })}</span>
            </label>
          </div>
        </fieldset>
        <fieldset className="an-panel an-run-panel">
          <legend className="an-panel-title">{m.dev_an_run_settings()}</legend>
          <div className="an-fields">
            <label className="an-field" data-field="runs">
              <span className="an-field-label">{m.dev_an_runs_variant()}</span>
              <select
                value={String(form.runs)}
                onChange={(event) => setForm({ ...form, runs: Number(event.target.value) })}
              >
                <option value="0">{m.dev_an_runs_none()}</option>
                {RUN_OPTIONS.map((runs) => (
                  <option key={runs} value={String(runs)}>
                    {runs}
                  </option>
                ))}
              </select>
            </label>
            <NumberField
              className="an-field"
              label={m.dev_an_seed()}
              value={form.seed}
              min={0}
              max={0x7fff_ffff}
              onChange={(seed) => setForm({ ...form, seed })}
            />
          </div>
          <JobBar input={input} state={job} locale={locale} exports={exports} />
        </fieldset>
      </div>
      {result ? (
        <SensitivityResults
          key={`${result.seed}-${result.steps.join(",")}`}
          result={result}
          data={data}
          locale={locale}
        />
      ) : (
        <p className="an-empty">{m.dev_an_empty()}</p>
      )}
    </div>
  );
}
