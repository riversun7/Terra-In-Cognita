// 보고서 설정 판 — 종류(파티 대 파티·파티 공성·웨이브 공성), 전투장·도시·웨이브 값, 제한 시간·판 수·시드, A/B(B 팀 따로·설정 칸 바꿈),
// 이름·메모, [보고서 돌리기]·진행 막대·[멈춤]. 판정은 서버 워커가 한다(서버 전체 한 번에 하나).
import type { LabCatalogResponse } from "@terra/shared/battleLab";
import {
  REPORT_EDGES,
  REPORT_LIMITS,
  type ReportMode,
  type ReportWaveDefense,
} from "@terra/shared/battleReport";
import { REPORT_WORLD_DEFENDERS_MAX } from "@terra/shared/battleReportCity";
import { useId } from "react";
import { m } from "../../../paraglide/messages.js";
import { getLocale } from "../../../paraglide/runtime.js";
import { NumberField } from "../lab/fields.tsx";
import type { Teams } from "../lab/labModel.ts";
import { CityPicker } from "./CityPicker.tsx";
import { OrdersEditor } from "./OrdersEditor.tsx";
import { VariantFormulas } from "./VariantFormulas.tsx";
import { cityName, defenseText, edgeText, modeText, reasonText, terrainLabel } from "./reportMessages.ts";
import {
  REPORT_LIMIT_OPTIONS,
  REPORT_RUN_OPTIONS,
  REPORT_SIEGE_LIMIT_OPTIONS,
  REPORT_SIEGE_RUN_OPTIONS,
  type ReportForm,
  type WaveForm,
  formProblem,
  legionsOf,
  siegeDefenseOf,
  teamsShown,
  waveDefenseOf,
  withLegions,
  withMode,
} from "./reportModel.ts";
import type { ReportJobState } from "./useReportJob.ts";

const L = REPORT_LIMITS;
const MODES: readonly ReportMode[] = ["arena", "siege", "wave"];
const SIEGE_DEFENSES: readonly ReportWaveDefense[] = ["party", "world"];
const WAVE_DEFENSES: readonly ReportWaveDefense[] = ["sim", "party", "world"];

function WaveFields(props: {
  readonly wave: WaveForm;
  readonly onChange: (wave: WaveForm) => void;
  /** 시뮬 휴먼 수비 칸(수·기술)을 보이나 */
  readonly simDefenders: boolean;
}) {
  const { wave, onChange } = props;
  return (
    <div className="rp-fields">
      <NumberField
        label={m.dev_report_wave_strength()}
        value={wave.strength}
        min={1}
        max={L.waveStrengthMax}
        field="strength"
        onChange={(strength) => onChange({ ...wave, strength, physical: Math.min(wave.physical, strength) })}
      />
      <NumberField
        label={m.dev_report_wave_physical()}
        value={wave.physical}
        min={0}
        max={wave.strength}
        field="physical"
        onChange={(physical) => onChange({ ...wave, physical })}
      />
      <NumberField
        label={m.dev_report_wave_creature_tech()}
        value={wave.creatureTech}
        min={L.techMin}
        max={L.techMax}
        onChange={(creatureTech) => onChange({ ...wave, creatureTech })}
      />
      {props.simDefenders ? (
        <>
          <NumberField
            label={m.dev_report_wave_defenders()}
            value={wave.defenders}
            min={1}
            max={L.waveDefendersMax}
            field="defenders"
            onChange={(defenders) => onChange({ ...wave, defenders })}
          />
          <NumberField
            label={m.dev_report_wave_defender_tech()}
            value={wave.defenderTech}
            min={L.techMin}
            max={L.techMax}
            onChange={(defenderTech) => onChange({ ...wave, defenderTech })}
          />
        </>
      ) : null}
    </div>
  );
}

export function ReportPanel(props: {
  readonly catalog: LabCatalogResponse;
  readonly form: ReportForm;
  readonly onForm: (form: ReportForm) => void;
  readonly teams: Teams;
  /** 팀 판이 고치는 설정(A 또는 B) */
  readonly editing: "a" | "b";
  readonly onEditing: (which: "a" | "b") => void;
  readonly job: ReportJobState;
  readonly onRun: () => void;
}) {
  const { catalog, form, onForm, teams, job } = props;
  const id = useId();
  const siege = form.mode !== "arena";
  const problem = formProblem(form, teams);
  const runOptions = siege ? REPORT_SIEGE_RUN_OPTIONS : REPORT_RUN_OPTIONS;
  const limitOptions = siege ? REPORT_SIEGE_LIMIT_OPTIONS : REPORT_LIMIT_OPTIONS;
  const current = job.job;
  const percent = current && current.total > 0 ? Math.floor((current.done * 100) / current.total) : 0;
  const separateB = form.mode === "wave" ? form.variantWave !== null : form.variantTeams !== null;
  const shown = teamsShown(form);
  // 명령 칸은 고치는 설정(A·B)의 군단을 고친다(B 팀 따로면 B 군단 — 사용자 1468)
  const editingB = props.editing === "b" && form.variantTeams !== null && form.mode !== "wave";
  const legions = legionsOf(form, editingB);
  const editTeams = editingB && form.variantTeams ? form.variantTeams : teams;
  const partyCounts = (team: "a" | "b"): number[] => [
    editTeams[team].units.length,
    ...legions[team].extra.map((party) => party.units.length),
  ];
  // 목표 공격은 상대가 실험실 군단일 때만(파티 대 파티·팀 수비 파티 공성)
  const enemyCounts = (team: "a" | "b"): number[] | null =>
    form.mode === "arena" || (form.mode === "siege" && siegeDefenseOf(form) === "party")
      ? partyCounts(team === "a" ? "b" : "a")
      : null;
  return (
    <section className="bp-panel rp-panel" aria-labelledby={`${id}-title`} data-mode={form.mode}>
      <div className="bp-panel-head">
        <h2 id={`${id}-title`} className="bp-title">
          {m.dev_report_settings_title()}
        </h2>
      </div>
      <div className="rp-modes" role="radiogroup" aria-label={m.dev_report_mode()}>
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={form.mode === mode}
            className="rp-mode"
            data-mode={mode}
            onClick={() => onForm(withMode(form, mode))}
          >
            {modeText(mode)}
          </button>
        ))}
      </div>
      <p className="field-hint">
        {form.mode === "arena"
          ? m.dev_report_mode_arena_hint()
          : form.mode === "siege"
            ? m.dev_report_mode_siege_hint()
            : m.dev_report_mode_wave_hint()}
      </p>
      <div className="rp-fields">
        {form.mode === "arena" ? (
          <div className="field">
            <label className="field-label" htmlFor={`${id}-terrain`}>
              {m.dev_lab_terrain()}
            </label>
            <select
              id={`${id}-terrain`}
              value={form.terrain}
              onChange={(event) => onForm({ ...form, terrain: event.target.value })}
            >
              {catalog.terrains.map((terrain) => (
                <option key={terrain.id} value={terrain.id}>
                  {terrainLabel(terrain)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div className="field">
              <label className="field-label" htmlFor={`${id}-layout`}>
                {m.dev_report_city_layout()}
              </label>
              <select
                id={`${id}-layout`}
                className="rp-layout"
                value={form.city.layout}
                onChange={(event) => {
                  const value = event.target.value;
                  const layout = value === "open" || value === "world" ? value : "city";
                  onForm({ ...form, city: { ...form.city, layout } });
                }}
              >
                <option value="city">{m.dev_report_city_layout_city()}</option>
                <option value="open">{m.dev_report_city_layout_open()}</option>
                <option value="world">{m.dev_report_city_layout_world()}</option>
              </select>
            </div>
            {form.city.layout === "world" ? (
              <>
                <CityPicker
                  cityId={form.city.cityId}
                  label={form.cityLabel}
                  onPick={(city) =>
                    onForm({
                      ...form,
                      city: { ...form.city, cityId: city.id },
                      cityLabel: cityName(city.name, city.id),
                    })
                  }
                />
                <p className="field-hint rp-wide">{m.dev_report_city_hint()}</p>
                <NumberField
                  label={m.dev_report_nexus()}
                  value={form.nexusDurability}
                  min={1}
                  max={L.nexusMax}
                  onChange={(nexusDurability) => onForm({ ...form, nexusDurability })}
                />
              </>
            ) : form.city.layout === "city" ? (
              <>
                <NumberField
                  label={m.dev_report_city_housing()}
                  value={form.city.housing}
                  min={0}
                  max={L.housingMax}
                  onChange={(housing) => onForm({ ...form, city: { ...form.city, housing } })}
                />
                <NumberField
                  label={m.dev_report_city_admin()}
                  value={form.city.adminLevel}
                  min={1}
                  max={L.adminLevelMax}
                  onChange={(adminLevel) => onForm({ ...form, city: { ...form.city, adminLevel } })}
                />
              </>
            ) : (
              <NumberField
                label={m.dev_report_nexus()}
                value={form.nexusDurability}
                min={1}
                max={L.nexusMax}
                onChange={(nexusDurability) => onForm({ ...form, nexusDurability })}
              />
            )}
          </>
        )}
        <div className="field">
          <label className="field-label" htmlFor={`${id}-limit`}>
            {m.dev_balance_limit()}
          </label>
          <select
            id={`${id}-limit`}
            className="rp-limit"
            value={form.limitSec}
            onChange={(event) => onForm({ ...form, limitSec: Number(event.target.value) })}
          >
            {limitOptions.map((value) => (
              <option key={value} value={value}>
                {m.dev_balance_seconds({ seconds: value })}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-runs`}>
            {m.dev_report_runs()}
          </label>
          <select
            id={`${id}-runs`}
            className="rp-runs"
            value={form.runs}
            onChange={(event) => onForm({ ...form, runs: Number(event.target.value) })}
          >
            {(runOptions as readonly number[]).includes(form.runs) ? null : (
              <option value={form.runs}>{form.runs}</option>
            )}
            {runOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <NumberField
          label={m.dev_lab_seed()}
          value={form.seed}
          min={0}
          max={0x7fff_ffff}
          className="rp-seed"
          onChange={(seed) => onForm({ ...form, seed })}
        />
      </div>
      {siege ? (
        <fieldset className="rp-group rp-defense">
          <legend>{m.dev_report_defense()}</legend>
          <div className="rp-modes" role="radiogroup" aria-label={m.dev_report_defense()}>
            {(form.mode === "wave" ? WAVE_DEFENSES : SIEGE_DEFENSES).map((defense) => {
              const chosen = form.mode === "wave" ? waveDefenseOf(form) : siegeDefenseOf(form);
              const blocked = defense === "world" && form.city.layout !== "world";
              return (
                <button
                  key={defense}
                  type="button"
                  role="radio"
                  aria-checked={chosen === defense}
                  aria-disabled={blocked}
                  className="rp-mode rp-defense-btn"
                  data-defense={defense}
                  onClick={() => {
                    if (blocked) return;
                    if (form.mode === "wave") onForm({ ...form, waveDefense: defense });
                    else onForm({ ...form, siegeDefense: defense === "world" ? "world" : "party" });
                  }}
                >
                  {defenseText(defense)}
                </button>
              );
            })}
          </div>
          {(form.mode === "wave" ? waveDefenseOf(form) : siegeDefenseOf(form)) === "world" ? (
            <p className="field-hint">
              {m.dev_report_defense_world_hint({ max: REPORT_WORLD_DEFENDERS_MAX })}
            </p>
          ) : null}
        </fieldset>
      ) : null}
      {form.mode === "wave" ? (
        <fieldset className="rp-group">
          <legend>{m.dev_report_wave_title()}</legend>
          <WaveFields
            wave={form.wave}
            simDefenders={waveDefenseOf(form) === "sim"}
            onChange={(wave) => onForm({ ...form, wave })}
          />
        </fieldset>
      ) : null}
      {siege ? (
        <fieldset className="rp-group rp-edge">
          <legend>{m.dev_report_edge()}</legend>
          <div className="rp-modes" role="radiogroup" aria-label={m.dev_report_edge()}>
            {REPORT_EDGES.map((edge) => (
              <button
                key={String(edge)}
                type="button"
                role="radio"
                aria-checked={form.edge === edge}
                className="rp-mode rp-edge-btn"
                data-edge={String(edge)}
                onClick={() => onForm({ ...form, edge })}
              >
                {edgeText(edge)}
              </button>
            ))}
          </div>
          <p className="field-hint">{m.dev_report_edge_hint()}</p>
        </fieldset>
      ) : null}
      {shown.a || shown.b ? (
        <fieldset className="rp-group rp-legion">
          <legend>{m.dev_report_legion_title()}</legend>
          <p className="field-hint">{m.dev_report_legion_hint()}</p>
          {(["a", "b"] as const)
            .filter((team) => shown[team])
            .map((team) => (
              <OrdersEditor
                key={`${editingB ? "B" : "A"}-${team}`}
                team={team}
                orders={legions[team].orders}
                parties={partyCounts(team).length}
                limitSec={form.limitSec}
                enemy={enemyCounts(team)}
                onChange={(orders) =>
                  onForm(withLegions(form, editingB, { ...legions, [team]: { ...legions[team], orders } }))
                }
              />
            ))}
        </fieldset>
      ) : null}

      <fieldset className="rp-group rp-variant" data-on={form.variantOn ? "" : undefined}>
        <legend>{m.dev_report_variant_title()}</legend>
        <label className="rp-check">
          <input
            type="checkbox"
            className="rp-variant-toggle"
            checked={form.variantOn}
            onChange={(event) => {
              onForm({ ...form, variantOn: event.target.checked });
              if (!event.target.checked) props.onEditing("a");
            }}
          />
          <span>{m.dev_report_variant_on()}</span>
        </label>
        <p className="field-hint">{m.dev_report_variant_hint()}</p>
        {form.variantOn ? (
          <>
            <div className="field">
              <label className="field-label" htmlFor={`${id}-vlabel`}>
                {m.dev_report_variant_label()}
              </label>
              <input
                id={`${id}-vlabel`}
                maxLength={L.labelMax}
                value={form.variantLabel}
                onChange={(event) => onForm({ ...form, variantLabel: event.target.value })}
              />
            </div>
            <label className="rp-check">
              <input
                type="checkbox"
                className="rp-variant-separate"
                checked={separateB}
                onChange={(event) => {
                  if (form.mode === "wave")
                    onForm({ ...form, variantWave: event.target.checked ? { ...form.wave } : null });
                  else {
                    // B 군단 전체(2번 파티부터·명령)를 A에서 베껴 따로 고친다(사용자 1468)
                    onForm({
                      ...form,
                      variantTeams: event.target.checked ? { a: teams.a, b: teams.b } : null,
                      variantLegion: event.target.checked ? form.legion : null,
                    });
                    props.onEditing(event.target.checked ? "b" : "a");
                  }
                }}
              />
              <span>{form.mode === "wave" ? m.dev_report_variant_wave() : m.dev_report_variant_teams()}</span>
            </label>
            {separateB && form.mode !== "wave" ? (
              <div className="rp-editing" role="radiogroup" aria-label={m.dev_report_editing()}>
                {(["a", "b"] as const).map((which) => (
                  <button
                    key={which}
                    type="button"
                    role="radio"
                    aria-checked={props.editing === which}
                    className="rp-mode rp-editing-btn"
                    data-which={which}
                    onClick={() => props.onEditing(which)}
                  >
                    {which === "a"
                      ? m.dev_report_setup_a()
                      : m.dev_report_setup_b({ label: form.variantLabel || "B" })}
                  </button>
                ))}
              </div>
            ) : null}
            {form.mode === "wave" && form.variantWave ? (
              <WaveFields
                wave={form.variantWave}
                simDefenders={waveDefenseOf(form) === "sim"}
                onChange={(variantWave) => onForm({ ...form, variantWave })}
              />
            ) : null}
            <div className="rp-tuning">
              <span className="field-label">{m.dev_report_variant_tuning()}</span>
              <p className="field-hint">{m.dev_report_variant_tuning_hint()}</p>
              {form.variantTuning.map((change, index) => (
                <div key={index} className="rp-tuning-row">
                  <input
                    aria-label={m.dev_report_variant_tuning_id()}
                    className="rp-tuning-id"
                    value={change.id}
                    placeholder="c1_xxx · physical_attack.str"
                    onChange={(event) =>
                      onForm({
                        ...form,
                        variantTuning: form.variantTuning.map((entry, at) =>
                          at === index ? { ...entry, id: event.target.value.trim() } : entry,
                        ),
                      })
                    }
                  />
                  <NumberField
                    label={m.dev_report_variant_tuning_value()}
                    hideLabel
                    value={change.value}
                    min={-1_000_000_000}
                    max={1_000_000_000}
                    onChange={(value) =>
                      onForm({
                        ...form,
                        variantTuning: form.variantTuning.map((entry, at) =>
                          at === index ? { ...entry, value } : entry,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="button-small"
                    onClick={() =>
                      onForm({ ...form, variantTuning: form.variantTuning.filter((_, at) => at !== index) })
                    }
                  >
                    {m.dev_report_remove()}
                  </button>
                </div>
              ))}
              {form.variantTuning.length < L.variantChangesMax ? (
                <button
                  type="button"
                  className="button-small rp-tuning-add"
                  onClick={() =>
                    onForm({ ...form, variantTuning: [...form.variantTuning, { id: "", value: 0 }] })
                  }
                >
                  {m.dev_report_variant_tuning_add()}
                </button>
              ) : null}
            </div>
            <VariantFormulas
              formulas={form.variantFormulas}
              locale={getLocale()}
              onChange={(variantFormulas) => onForm({ ...form, variantFormulas })}
            />
          </>
        ) : null}
      </fieldset>

      <div className="rp-fields">
        <div className="field rp-wide">
          <label className="field-label" htmlFor={`${id}-name`}>
            {m.dev_report_name()}
          </label>
          <input
            id={`${id}-name`}
            className="rp-name"
            maxLength={L.nameMax}
            placeholder={m.dev_report_name_placeholder()}
            value={form.name}
            onChange={(event) => onForm({ ...form, name: event.target.value })}
          />
        </div>
        <div className="field rp-wide">
          <label className="field-label" htmlFor={`${id}-note`}>
            {m.dev_report_note()}
          </label>
          <input
            id={`${id}-note`}
            maxLength={L.noteMax}
            value={form.note}
            onChange={(event) => onForm({ ...form, note: event.target.value })}
          />
        </div>
      </div>
      {problem ? (
        <p className="field-error rp-problem" data-reason={problem}>
          {reasonText(problem)}
        </p>
      ) : null}
      <div className="rp-actions">
        <button
          type="button"
          className="button-primary rp-run"
          aria-disabled={job.busy || problem !== null}
          onClick={job.busy || problem !== null ? undefined : props.onRun}
        >
          {job.busy ? m.dev_lab_running() : m.dev_report_run({ runs: form.runs * (form.variantOn ? 2 : 1) })}
        </button>
        {current?.state === "running" ? (
          <button type="button" className="button-small rp-cancel" onClick={job.cancel}>
            {m.dev_report_cancel()}
          </button>
        ) : null}
      </div>
      {current ? (
        <div className="rp-progress" data-state={current.state}>
          <progress max={current.total} value={current.done} aria-label={m.dev_report_progress()} />
          <span className="field-hint">
            {m.dev_report_progress_text({
              done: current.done,
              total: current.total,
              percent,
              seconds: Math.round(current.elapsedMs / 1000),
            })}
          </span>
        </div>
      ) : null}
      {job.error ? (
        <p role="alert" className="field-error rp-error">
          {reasonText(job.error)}
        </p>
      ) : null}
      <p className="field-hint">{m.dev_report_load_hint({ siegeMax: L.siegeRunsMax, max: L.runsMax })}</p>
    </section>
  );
}
