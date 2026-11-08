// [분포 상성] 탭 — docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-08 완전 개편)" 1절.
// 같은 총합의 1차 분포 여럿을 서버 판정(전투 실험실 몬테카를로)으로 짝마다 여러 판 붙여 승률표(열지도)·상성 요약·사양 표를 만든다.
// 입력(조건·분포·총합·판 수·시드)은 이 기기에 남긴다. 시험용 data-*: .an-matrix data-status(idle·running·done·failed·cancelled).
import { ANALYSIS_LIMITS, ANALYSIS_BUILD_PRESETS } from "@terra/shared/balanceAnalysis";
import { PRIMARY_STATS } from "@terra/shared/roster";
import { useMemo, useState } from "react";
import { m } from "../../../paraglide/messages.js";
import { primaryCode, primaryName } from "../balanceMessages.ts";
import { NumberField } from "../lab/fields.tsx";
import type { LabData } from "../lab/useLabData.ts";
import { buildName } from "./analysisMessages.ts";
import {
  type BuildForm,
  type MatrixForm,
  RUN_OPTIONS,
  SUM_OPTIONS,
  defaultMatrixForm,
  exportJson,
  isMatrixForm,
  loadForm,
  matrixCsv,
  matrixInputOf,
  nextBuildId,
  saveForm,
  weightShares,
} from "./analysisModel.ts";
import { ConditionsPanel, TemplateSelect } from "./ConditionsPanel.tsx";
import { JobBar } from "./JobBar.tsx";
import { MatrixResults } from "./MatrixResults.tsx";
import { useAnalysisJob } from "./useAnalysisJob.ts";

export function MatrixTab({ data, locale }: { data: LabData; locale: string }) {
  const [form, setFormState] = useState<MatrixForm>(
    () => loadForm("matrix", isMatrixForm) ?? defaultMatrixForm(buildName),
  );
  const setForm = (next: MatrixForm) => {
    setFormState(next);
    saveForm("matrix", next);
  };
  const job = useAnalysisJob("matrix");
  const input = useMemo(
    () => matrixInputOf(form, data.presets?.presets ?? [], data.teams),
    [form, data.presets, data.teams],
  );
  const result = job.result?.kind === "matrix" ? job.result : null;
  const [addPreset, setAddPreset] = useState("");

  const updateBuild = (index: number, change: (build: BuildForm) => BuildForm) =>
    setForm({ ...form, builds: form.builds.map((build, i) => (i === index ? change(build) : build)) });
  const canAdd = form.builds.length < ANALYSIS_LIMITS.buildsMax;
  const unused = ANALYSIS_BUILD_PRESETS.filter(
    (preset) => !form.builds.some((build) => build.id === preset.id),
  );
  const toggleSum = (sum: number) => {
    const has = form.sums.includes(sum);
    if (has && form.sums.length === 1) return;
    if (!has && form.sums.length >= ANALYSIS_LIMITS.sumsMax) return;
    setForm({
      ...form,
      sums: has ? form.sums.filter((value) => value !== sum) : [...form.sums, sum].toSorted((a, b) => a - b),
    });
  };

  const exports = result
    ? {
        csv: matrixCsv(result),
        json: exportJson(job.input ?? input, result),
        name: `balance-matrix-seed${result.seed}`,
      }
    : null;

  return (
    <div className="an-tab an-matrix" data-status={job.job?.state ?? "idle"}>
      <p className="an-lead">{m.dev_an_lead_matrix()}</p>
      <div className="an-setup">
        <ConditionsPanel
          form={form.conditions}
          onChange={(conditions) => setForm({ ...form, conditions })}
          data={data}
          locale={locale}
        />
        <fieldset className="an-panel an-builds-panel">
          <legend className="an-panel-title">
            {m.dev_an_builds()} <span className="an-count">{form.builds.length}</span>
          </legend>
          <ul className="an-builds">
            {form.builds.map((build, index) => {
              const shares = weightShares(build.weights);
              return (
                <li key={build.id} className="an-build" data-build={build.id}>
                  <div className="an-build-head">
                    <label className="an-build-name">
                      <span className="visually-hidden">{m.dev_an_build_label()}</span>
                      <input
                        className="input"
                        value={build.label}
                        maxLength={ANALYSIS_LIMITS.labelMax}
                        onChange={(event) =>
                          updateBuild(index, (entry) => ({ ...entry, label: event.target.value }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="button-small an-build-remove"
                      aria-disabled={form.builds.length <= ANALYSIS_LIMITS.buildsMin || undefined}
                      aria-label={m.dev_an_build_remove_named({ name: build.label })}
                      onClick={() => {
                        if (form.builds.length > ANALYSIS_LIMITS.buildsMin)
                          setForm({ ...form, builds: form.builds.filter((_, i) => i !== index) });
                      }}
                    >
                      {m.dev_an_build_remove()}
                    </button>
                  </div>
                  <span className="an-share" aria-hidden="true">
                    {PRIMARY_STATS.map((stat) => (
                      <span
                        key={stat}
                        className="an-share-part"
                        data-stat={stat}
                        style={{ flexGrow: Math.max(0, shares[stat]) }}
                      />
                    ))}
                  </span>
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
                        value={build.weights[stat]}
                        min={0}
                        max={ANALYSIS_LIMITS.weightMax}
                        hint={m.dev_an_weight_hint({
                          pct: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
                            shares[stat] / 10,
                          ),
                        })}
                        onChange={(value) =>
                          updateBuild(index, (entry) => ({
                            ...entry,
                            weights: { ...entry.weights, [stat]: value },
                          }))
                        }
                      />
                    ))}
                  </div>
                  <TemplateSelect
                    label={m.dev_an_build_template()}
                    value={build.templateId}
                    onChange={(value) => updateBuild(index, (entry) => ({ ...entry, templateId: value }))}
                    data={data}
                    locale={locale}
                    allowShared
                    className="an-build-template"
                  />
                </li>
              );
            })}
          </ul>
          <div className="an-build-add">
            <button
              type="button"
              className="button-small"
              aria-disabled={!canAdd || undefined}
              onClick={() => {
                if (!canAdd) return;
                const id = nextBuildId(form.builds);
                setForm({
                  ...form,
                  builds: [
                    ...form.builds,
                    {
                      id,
                      label: m.dev_an_build_custom({ n: id.slice("custom_".length) }),
                      weights: { str: 1, vit: 1, int: 1, wis: 1, dex: 1, agi: 1 },
                      templateId: null,
                    },
                  ],
                });
              }}
            >
              {m.dev_an_build_add()}
            </button>
            {unused.length > 0 ? (
              <label className="an-field an-inline">
                <span className="visually-hidden">{m.dev_an_build_add_preset()}</span>
                <select
                  value={addPreset}
                  aria-disabled={!canAdd || undefined}
                  onChange={(event) => {
                    const preset = unused.find((entry) => entry.id === event.target.value);
                    setAddPreset("");
                    if (!preset || !canAdd) return;
                    setForm({
                      ...form,
                      builds: [
                        ...form.builds,
                        {
                          id: preset.id,
                          label: buildName(preset.id),
                          weights: preset.weights,
                          templateId: null,
                        },
                      ],
                    });
                  }}
                >
                  <option value="">{m.dev_an_build_add_preset()}</option>
                  {unused.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {buildName(preset.id)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </fieldset>
        <fieldset className="an-panel an-run-panel">
          <legend className="an-panel-title">{m.dev_an_run_settings()}</legend>
          <div className="an-field an-field-wide">
            <span className="an-field-label" id="an-sums-label">
              {m.dev_an_sums()}
            </span>
            <div className="an-chips" role="group" aria-labelledby="an-sums-label">
              {SUM_OPTIONS.map((sum) => (
                <button
                  key={sum}
                  type="button"
                  className="an-chip"
                  aria-pressed={form.sums.includes(sum)}
                  onClick={() => toggleSum(sum)}
                >
                  {sum}
                </button>
              ))}
            </div>
            <span className="an-hint">{m.dev_an_sums_hint({ max: ANALYSIS_LIMITS.sumsMax })}</span>
          </div>
          <div className="an-fields">
            <label className="an-field" data-field="runs">
              <span className="an-field-label">{m.dev_an_runs()}</span>
              <select
                value={String(form.runs)}
                onChange={(event) => setForm({ ...form, runs: Number(event.target.value) })}
              >
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
        <MatrixResults result={result} locale={locale} />
      ) : (
        <p className="an-empty">{m.dev_an_empty()}</p>
      )}
    </div>
  );
}
