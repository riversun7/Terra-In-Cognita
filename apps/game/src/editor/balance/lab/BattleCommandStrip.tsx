// 전투 테스트 상단 조작 막대 — 전투 규모(1:1 비교·파티전·군단전) 전환, 팀 바꾸기·복사,
// 바로 실행([3D 전투 보기]·[한 판]·[3D 탭에서 보기]), 핵심 조건(지형·시드)과 한 판 결과를 화면 맨 위에 둔다.
import {
  LAB_LIMITS,
  type LabBattleResponse,
  type LabCatalogResponse,
  labSettingsProblem,
} from "@terra/shared/battleLab";
import { useId, useState } from "react";
import { m } from "../../../paraglide/messages.js";
import { LiveMessage, type LiveLines } from "../../../ui/LiveMessage.tsx";
import { terrainLabel } from "../report/reportMessages.ts";
import type { ReportForm } from "../report/reportModel.ts";
import { type Teams, parseIntIn } from "./labModel.ts";
import { BattleResult, type LegionParties } from "./LabResults.tsx";

export type BattleScale = "duel" | "party" | "legion";

const QUICK_LEVELS = [1, 10, 20, 30, 50, 60] as const;

export function BattleCommandStrip(props: {
  readonly catalog: LabCatalogResponse;
  readonly form: ReportForm;
  readonly onForm: (form: ReportForm) => void;
  readonly scale: BattleScale;
  readonly onScale: (scale: BattleScale) => void;
  readonly onSwapTeams: () => void;
  readonly onCopyAToB: () => void;
  readonly onSetAllLevel: (level: number) => void;
  readonly onShiftAllLevel: (delta: number) => void;
  readonly busy: "battle" | "watch" | null;
  readonly onBattle: () => void;
  readonly onWatch: () => void;
  readonly onOpenReplayTab: () => void;
  readonly battle: { readonly result: LabBattleResponse; readonly stale: boolean } | null;
  readonly problem: LiveLines;
  readonly teams: Teams;
  readonly legion: LegionParties;
  readonly locale: string;
}) {
  const { catalog, form } = props;
  const id = useId();
  const [bulkLevelText, setBulkLevelText] = useState("30");
  const isArena = form.mode === "arena";
  const battleIssue = labSettingsProblem({ limitSec: Math.min(600, form.limitSec) });
  const running = props.busy !== null;
  const parsedBulk = parseIntIn(bulkLevelText, LAB_LIMITS.levelMin, LAB_LIMITS.levelMax);

  const applyBulkLevel = (): void => {
    if (parsedBulk === null) return;
    props.onSetAllLevel(parsedBulk);
  };

  return (
    <section className="bp-panel bl-command-strip" aria-label={m.dev_report_single_title()}>
      <div className="bl-command-top">
        <div className="bl-scale-group" role="group" aria-label={m.dev_lab_scale_label()}>
          {(
            [
              ["duel", m.dev_lab_scale_duel()],
              ["party", m.dev_lab_scale_party()],
              ["legion", m.dev_lab_scale_legion()],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="button-small bl-scale-btn"
              data-scale={key}
              aria-pressed={isArena && props.scale === key}
              onClick={() => props.onScale(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {isArena ? (
          <div className="bl-team-utils">
            <button type="button" className="button-small bl-swap-teams" onClick={props.onSwapTeams}>
              {m.dev_lab_swap_teams()}
            </button>
            <button type="button" className="button-small bl-copy-a-b" onClick={props.onCopyAToB}>
              {m.dev_lab_copy_a_to_b()}
            </button>
          </div>
        ) : null}
      </div>

      <div className="bl-level-bar bl-level-bar-all">
        <span className="bl-level-label">{m.dev_lab_level_all_label()}</span>
        <div className="bl-level-chips">
          {QUICK_LEVELS.map((lv) => (
            <button
              key={lv}
              type="button"
              className="button-small bl-level-chip"
              data-level={lv}
              onClick={() => {
                setBulkLevelText(String(lv));
                props.onSetAllLevel(lv);
              }}
            >
              {`Lv ${lv}`}
            </button>
          ))}
        </div>
        <div className="bl-level-steppers">
          {([-5, -1, 1, 5] as const).map((delta) => (
            <button
              key={delta}
              type="button"
              className="button-small bl-level-step"
              onClick={() => props.onShiftAllLevel(delta)}
            >
              {delta > 0 ? `+${delta}` : String(delta)}
            </button>
          ))}
          <label className="visually-hidden" htmlFor={`${id}-bulk-lv`}>
            {m.dev_lab_level_all_label()}
          </label>
          <input
            id={`${id}-bulk-lv`}
            className="input bl-level-input"
            inputMode="numeric"
            value={bulkLevelText}
            aria-invalid={parsedBulk === null}
            onChange={(event) => setBulkLevelText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyBulkLevel();
              }
            }}
          />
          <button
            type="button"
            className="button-small bl-level-apply-all"
            aria-disabled={parsedBulk === null}
            onClick={applyBulkLevel}
          >
            {m.dev_lab_level_apply_all()}
          </button>
        </div>
      </div>

      {isArena ? (
        <>
          <div className="bl-command-run">
            <div className="bl-modes">
              <button
                type="button"
                className="button-primary button-small bl-watch"
                aria-disabled={!catalog.replay || running || battleIssue !== null}
                aria-describedby={`${id}-watch-hint`}
                onClick={!catalog.replay || running || battleIssue !== null ? undefined : props.onWatch}
              >
                {props.busy === "watch" ? m.dev_lab_watch_loading() : m.dev_lab_watch()}
              </button>
              <button
                type="button"
                className="button-small bl-battle"
                aria-disabled={running || battleIssue !== null}
                onClick={running || battleIssue !== null ? undefined : props.onBattle}
              >
                {props.busy === "battle" ? m.dev_lab_running() : m.dev_lab_battle()}
              </button>
              <button
                type="button"
                className="button-small bl-open-replay-tab"
                aria-disabled={!catalog.replay || running || battleIssue !== null}
                onClick={
                  !catalog.replay || running || battleIssue !== null ? undefined : props.onOpenReplayTab
                }
              >
                {m.dev_lab_watch_tab_btn()}
              </button>
            </div>

            <div className="bl-quick-opts">
              <label className="bl-quick-field" htmlFor={`${id}-terrain`}>
                <span>{m.dev_lab_terrain()}</span>
                <select
                  id={`${id}-terrain`}
                  className="bl-quick-terrain"
                  value={form.terrain}
                  onChange={(event) => props.onForm({ ...form, terrain: event.target.value })}
                >
                  {catalog.terrains.map((terrain) => (
                    <option key={terrain.id} value={terrain.id}>
                      {terrainLabel(terrain)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="bl-quick-field" htmlFor={`${id}-seed`}>
                <span>{m.dev_lab_seed()}</span>
                <input
                  id={`${id}-seed`}
                  className="input bl-quick-seed"
                  inputMode="numeric"
                  type="number"
                  min={0}
                  max={0x7fff_ffff}
                  value={form.seed}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10);
                    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 0x7fff_ffff) {
                      props.onForm({ ...form, seed: parsed });
                    }
                  }}
                />
              </label>
            </div>
          </div>

          <p id={`${id}-watch-hint`} className="field-hint bl-watch-hint">
            {catalog.replay ? m.dev_lab_watch_hint() : m.dev_lab_watch_pending()}
          </p>
          <LiveMessage tone="error" lines={props.problem.lines} version={props.problem.version} />

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
                legion={props.legion}
                catalog={catalog}
                locale={props.locale}
              />
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
