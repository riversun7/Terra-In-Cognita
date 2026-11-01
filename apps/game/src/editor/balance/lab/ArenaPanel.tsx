// 전투장 판 — 지형(빈 평지·시험 2차맵·시험 자리 종류)·제한 시간·시드·몬테카를로 판 수, 모드 단추 셋:
// (가) 3D 관람(같은 시드의 한 판을 리플레이로 받아 3D 관람 창에, 서버 목록 `replay`가 거짓이면 꺼 두고 "준비 중"), (나) 한 판, (다) 몬테카를로.
// 결과가 지금 입력과 다르면(팀·설정을 고친 뒤) "지난 입력의 결과"를 알린다. 판정은 서버 워커가 한다(한 번에 하나).
import {
  LAB_LIMITS,
  type LabBattleResponse,
  type LabCatalogResponse,
  type LabMonteCarloResponse,
  type LabTerrainView,
  labSettingsProblem,
} from "@terra/shared/battleLab";
import { useId } from "react";
import { m } from "../../../paraglide/messages.js";
import { LiveMessage, type LiveLines } from "../../../ui/LiveMessage.tsx";
import { NumberField } from "./fields.tsx";
import { LAB_LIMIT_OPTIONS, LAB_RUN_OPTIONS, type Teams } from "./labModel.ts";
import { BattleResult, MonteResult } from "./LabResults.tsx";

export interface ArenaSettings {
  readonly terrain: string;
  readonly limitSec: number;
  readonly seed: number;
  readonly runs: number;
}

const PRESET_TEXT: Readonly<Record<string, () => string>> = {
  river: m.second_map_lab_preset_river,
  coast: m.second_map_lab_preset_coast,
  lake: m.second_map_lab_preset_lake,
  mountain: m.second_map_lab_preset_mountain,
  forest: m.second_map_lab_preset_forest,
  grassland: m.second_map_lab_preset_grassland,
};

function terrainText(terrain: LabTerrainView): string {
  if (terrain.kind === "flat") return m.dev_lab_terrain_flat();
  if (terrain.kind === "test") return m.dev_lab_terrain_test();
  return m.dev_lab_terrain_preset({
    name: PRESET_TEXT[terrain.preset ?? ""]?.() ?? terrain.preset ?? terrain.id,
  });
}

export function ArenaPanel(props: {
  readonly catalog: LabCatalogResponse;
  readonly settings: ArenaSettings;
  readonly onSettings: (settings: ArenaSettings) => void;
  readonly busy: "battle" | "monte" | "watch" | null;
  readonly onBattle: () => void;
  readonly onMonte: () => void;
  readonly onWatch: () => void;
  readonly battle: { readonly result: LabBattleResponse; readonly stale: boolean } | null;
  readonly monte: { readonly result: LabMonteCarloResponse; readonly stale: boolean } | null;
  readonly problem: LiveLines;
  readonly teams: Teams;
  readonly locale: string;
}) {
  const { catalog, settings, onSettings } = props;
  const id = useId();
  const battleIssue = labSettingsProblem({ limitSec: settings.limitSec });
  const monteIssue = labSettingsProblem({ limitSec: settings.limitSec, runs: settings.runs });
  const running = props.busy !== null;
  return (
    <section className="bp-panel bl-arena" aria-labelledby={`${id}-title`}>
      <div className="bp-panel-head">
        <h2 id={`${id}-title`} className="bp-title">
          {m.dev_lab_arena_title()}
        </h2>
      </div>
      <p className="field-hint">{m.dev_lab_arena_hint()}</p>
      <div className="bl-arena-settings">
        <div className="field">
          <label className="field-label" htmlFor={`${id}-terrain`}>
            {m.dev_lab_terrain()}
          </label>
          <select
            id={`${id}-terrain`}
            className="bl-terrain"
            value={settings.terrain}
            onChange={(event) => onSettings({ ...settings, terrain: event.target.value })}
          >
            {catalog.terrains.map((terrain) => (
              <option key={terrain.id} value={terrain.id}>
                {terrainText(terrain)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-limit`}>
            {m.dev_balance_limit()}
          </label>
          <select
            id={`${id}-limit`}
            className="bl-limit"
            value={settings.limitSec}
            onChange={(event) => onSettings({ ...settings, limitSec: Number(event.target.value) })}
          >
            {LAB_LIMIT_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {m.dev_balance_seconds({ seconds: value })}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-runs`}>
            {m.dev_lab_runs()}
          </label>
          <select
            id={`${id}-runs`}
            className="bl-runs"
            value={settings.runs}
            onChange={(event) => onSettings({ ...settings, runs: Number(event.target.value) })}
          >
            {LAB_RUN_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <NumberField
          label={m.dev_lab_seed()}
          value={settings.seed}
          min={0}
          max={0x7fff_ffff}
          className="bl-seed"
          onChange={(seed) => onSettings({ ...settings, seed })}
        />
      </div>
      {monteIssue === "budget" ? (
        <p className="field-error">
          {m.dev_lab_budget({ max: LAB_LIMITS.runSecondsMax, value: settings.runs * settings.limitSec })}
        </p>
      ) : null}
      <div className="bl-modes">
        <button
          type="button"
          className="button-small bl-watch"
          aria-disabled={!catalog.replay || running || battleIssue !== null}
          aria-describedby={`${id}-watch-hint`}
          onClick={!catalog.replay || running || battleIssue !== null ? undefined : props.onWatch}
        >
          {props.busy === "watch" ? m.dev_lab_watch_loading() : m.dev_lab_watch()}
        </button>
        <button
          type="button"
          className="button-primary button-small bl-battle"
          aria-disabled={running || battleIssue !== null}
          onClick={running || battleIssue !== null ? undefined : props.onBattle}
        >
          {props.busy === "battle" ? m.dev_lab_running() : m.dev_lab_battle()}
        </button>
        <button
          type="button"
          className="button-primary button-small bl-monte-run"
          aria-disabled={running || monteIssue !== null}
          onClick={running || monteIssue !== null ? undefined : props.onMonte}
        >
          {props.busy === "monte" ? m.dev_lab_running() : m.dev_lab_monte({ runs: settings.runs })}
        </button>
      </div>
      <p id={`${id}-watch-hint`} className="field-hint bl-watch-hint">
        {catalog.replay ? m.dev_lab_watch_hint() : m.dev_lab_watch_pending()}
      </p>
      <LiveMessage tone="error" lines={props.problem.lines} version={props.problem.version} />
      {!props.battle && !props.monte ? (
        <p className="field-hint bl-results-empty">{m.dev_lab_results_empty()}</p>
      ) : null}
      {props.battle ? (
        <section
          className="bl-result-block"
          aria-label={m.dev_lab_battle_result()}
          data-stale={props.battle.stale ? "" : undefined}
        >
          <h3 className="bl-subtitle">{m.dev_lab_battle_result()}</h3>
          {props.battle.stale ? <p className="field-hint bp-stale">{m.dev_lab_stale()}</p> : null}
          <BattleResult
            result={props.battle.result}
            teams={props.teams}
            catalog={catalog}
            locale={props.locale}
          />
        </section>
      ) : null}
      {props.monte ? (
        <section
          className="bl-result-block"
          aria-label={m.dev_lab_monte_result()}
          data-stale={props.monte.stale ? "" : undefined}
        >
          <h3 className="bl-subtitle">{m.dev_lab_monte_result()}</h3>
          {props.monte.stale ? <p className="field-hint bp-stale">{m.dev_lab_stale()}</p> : null}
          <MonteResult
            result={props.monte.result}
            teams={props.teams}
            catalog={catalog}
            locale={props.locale}
          />
        </section>
      ) : null}
    </section>
  );
}
