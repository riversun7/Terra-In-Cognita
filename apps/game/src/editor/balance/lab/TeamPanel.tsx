// 팀 판(팀 A·B 같은 틀) — 파티 하나(최대 6명, 49 C6): 유닛 줄(고르기·진형 줄·차례·빼기), 유닛 더하기(새 유닛·유닛 프리셋),
// 파티 프리셋 막대, 퇴각 기준선(⑦ 파티 HP %). 고른 유닛은 유닛 편집 판이 고친다.
import {
  LAB_LIMITS,
  LAB_ROWS,
  type LabCatalogResponse,
  type LabPresetListResponse,
  type LabTeam,
  newLabUnit,
} from "@terra/shared/battleLab";
import {
  FORMATION_DEPTH,
  FORMATION_PRESETS,
  type FormationPresetId,
  FORMATION_WIDTH,
  FORMATION_X_MIN,
  FORMATION_Y_MIN,
} from "@terra/shared/roster";
import { useId, useState } from "react";
import { m } from "../../../paraglide/messages.js";
import { NumberField } from "./fields.tsx";
import {
  DEFAULT_UNIT_PRESET,
  type Selection,
  type Teams,
  addUnit,
  applyFormationPreset,
  moveUnit,
  moveUnitFormationPos,
  nameIn,
  parseIntIn,
  partyFormationPositions,
  partyPresets,
  removeUnit,
  replaceParty,
  setPartyLevel,
  shiftPartyLevel,
  unitPresets,
  updateUnit,
  withRow,
} from "./labModel.ts";
import { toDuelParty } from "./legionPresets.ts";
import { itemName, localized, rowText, teamText, unitTitle } from "./labMessages.ts";
import { PresetBar } from "./PresetBar.tsx";

const FORMATION_X_COLS = Array.from({ length: FORMATION_WIDTH }, (_, idx) => FORMATION_X_MIN + idx);
const FORMATION_Y_ROWS = Array.from({ length: FORMATION_DEPTH }, (_, idx) => FORMATION_Y_MIN + idx);

const formatCoord = (x: number, y: number): string => `(${x > 0 ? `+${x}` : x}, ${y})`;

export function TeamPanel(props: {
  readonly team: LabTeam;
  readonly teams: Teams;
  readonly setTeams: (change: (teams: Teams) => Teams) => void;
  readonly selected: Selection;
  readonly onSelect: (at: Selection) => void;
  readonly catalog: LabCatalogResponse;
  readonly presets: LabPresetListResponse | null;
  readonly onPresets: (list: LabPresetListResponse) => void;
  readonly onNotice: (line: string, tone: "success" | "error") => void;
  readonly locale: string;
}) {
  const { team, teams, catalog, locale } = props;
  const party = teams[team];
  const id = useId();
  const [adding, setAdding] = useState("");
  const [presetId, setPresetId] = useState<FormationPresetId | null>(null);
  const [teamLevelText, setTeamLevelText] = useState(() => String(party.units[0]?.level ?? 30));
  const full = party.units.length >= LAB_LIMITS.partyMax;
  const parsedTeamLevel = parseIntIn(teamLevelText, LAB_LIMITS.levelMin, LAB_LIMITS.levelMax);

  const applyTeamLevel = (): void => {
    if (parsedTeamLevel === null) return;
    props.setTeams((current) => replaceParty(current, team, setPartyLevel(current[team], parsedTeamLevel)));
    props.onNotice(m.dev_lab_level_applied_team({ team: teamText(team), level: parsedTeamLevel }), "success");
  };

  const shiftTeamLevel = (delta: number): void => {
    props.setTeams((current) => replaceParty(current, team, shiftPartyLevel(current[team], delta)));
    const nextFirst = Math.max(
      LAB_LIMITS.levelMin,
      Math.min(LAB_LIMITS.levelMax, (party.units[0]?.level ?? 1) + delta),
    );
    setTeamLevelText(String(nextFirst));
  };
  const units = unitPresets(props.presets?.presets ?? []);
  const positions = partyFormationPositions(party);
  const activeUnitIndex = props.selected.team === team ? props.selected.index : 0;

  const add = (): void => {
    if (full) return;
    // 기본은 새 사이보그 샘플(기본 무기·장비·스킬, D-490). 종류만 고르면 빈 몸, 프리셋이면 그 값
    const fallback = units.find((entry) => entry.id === DEFAULT_UNIT_PRESET)?.data;
    let unit = fallback ?? newLabUnit(catalog.unitKinds[0]?.id ?? "cyborg");
    if (adding.startsWith("kind:")) unit = newLabUnit(adding.slice(5));
    else if (adding !== "") {
      const preset = units.find((entry) => entry.id === adding);
      if (preset) unit = preset.data;
    }
    props.setTeams((current) => addUnit(current, team, unit));
    props.onSelect({ team, index: party.units.length });
  };

  const applyPreset = (nextPreset: FormationPresetId): void => {
    setPresetId(nextPreset);
    props.setTeams((current) => applyFormationPreset(current, team, nextPreset));
  };

  const pickCell = (x: number, y: number): void => {
    const occupant = positions.findIndex((entry) => entry.x === x && entry.y === y);
    if (occupant >= 0 && (props.selected.team !== team || occupant !== activeUnitIndex)) {
      props.onSelect({ team, index: occupant });
      return;
    }
    setPresetId(null);
    const targetIndex = Math.max(0, Math.min(party.units.length - 1, activeUnitIndex));
    props.setTeams((current) => moveUnitFormationPos(current, { team, index: targetIndex }, { x, y }));
    props.onSelect({ team, index: targetIndex });
  };

  return (
    <section className="bp-panel bl-team" data-team={team} aria-labelledby={`${id}-title`}>
      <div className="bp-panel-head">
        <h2 id={`${id}-title`} className="bp-title bl-team-title">
          {teamText(team)}
          <span className="bl-count">
            {m.dev_lab_party_count({ count: party.units.length, max: LAB_LIMITS.partyMax })}
          </span>
        </h2>
        {party.units.length > 1 ? (
          <button
            type="button"
            className="button-small bl-duel-trim"
            onClick={() => {
              const keepIndex = props.selected.team === team ? props.selected.index : 0;
              props.setTeams((current) => replaceParty(current, team, toDuelParty(current[team], keepIndex)));
              props.onSelect({ team, index: 0 });
            }}
          >
            {m.dev_lab_duel_trim()}
          </button>
        ) : null}
      </div>
      <PresetBar
        kind="party"
        presets={partyPresets(props.presets?.presets ?? [])}
        writable={props.presets?.writable ?? false}
        locale={locale}
        current={() => ({ kind: "party", data: party })}
        onLoad={(value) => {
          if (value.kind !== "party") return;
          setPresetId(null);
          props.setTeams((current) => replaceParty(current, team, value.data));
          props.onSelect({ team, index: 0 });
        }}
        onList={props.onPresets}
        onNotice={props.onNotice}
      />
      <div className="bl-team-level-bar">
        <span className="bl-level-label">{m.dev_lab_level_team_label()}</span>
        <div className="bl-level-steppers">
          {([-5, -1, 1, 5] as const).map((delta) => (
            <button
              key={delta}
              type="button"
              className="button-small bl-level-step"
              onClick={() => shiftTeamLevel(delta)}
            >
              {delta > 0 ? `+${delta}` : String(delta)}
            </button>
          ))}
          <label className="visually-hidden" htmlFor={`${id}-team-lv`}>
            {m.dev_lab_level_team_label()}
          </label>
          <input
            id={`${id}-team-lv`}
            className="input bl-level-input"
            inputMode="numeric"
            value={teamLevelText}
            aria-invalid={parsedTeamLevel === null}
            onChange={(event) => setTeamLevelText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyTeamLevel();
              }
            }}
          />
          <button
            type="button"
            className="button-small bl-team-level-apply"
            aria-disabled={parsedTeamLevel === null}
            onClick={applyTeamLevel}
          >
            {m.dev_lab_level_apply_team()}
          </button>
        </div>
      </div>
      <ol className="bl-units">
        {party.units.map((unit, index) => {
          const at = { team, index };
          const active = props.selected.team === team && props.selected.index === index;
          const pos = positions[index] ?? { x: 0, y: 1 };
          const weapon =
            unit.weapon.kind === "item"
              ? itemName(catalog, unit.weapon.id, locale)
              : unit.weapon.kind === "custom"
                ? m.dev_lab_weapon_custom()
                : m.dev_lab_weapon_natural();
          return (
            // oxlint-disable-next-line react/no-array-index-key -- 같은 프리셋 유닛이 여러 번 들 수 있어 차례가 열쇠다
            <li key={index} className="bl-unit" data-active={active ? "" : undefined}>
              <button
                type="button"
                className="bl-unit-pick"
                aria-pressed={active}
                onClick={() => props.onSelect(at)}
              >
                <span className="bl-unit-key">{`${team.toUpperCase()}${index + 1}`}</span>
                <span className="bl-unit-name">{unitTitle(unit, catalog, locale)}</span>
                <span className="bl-unit-meta">
                  {`${formatCoord(pos.x, pos.y)} · ${weapon}`}
                  {unit.skills.length > 0 ? ` · ${m.dev_lab_skill_count({ count: unit.skills.length })}` : ""}
                </span>
              </button>
              <div className="bl-unit-tools">
                <label className="visually-hidden" htmlFor={`${id}-row-${index}`}>
                  {m.dev_lab_row()}
                </label>
                <select
                  id={`${id}-row-${index}`}
                  className="bl-row-select"
                  value={unit.row}
                  onChange={(event) => {
                    const row = LAB_ROWS.find((entry) => entry === event.target.value) ?? "front";
                    props.setTeams((current) => updateUnit(current, at, (entry) => withRow(entry, row)));
                  }}
                >
                  {LAB_ROWS.map((row) => (
                    <option key={row} value={row}>
                      {rowText(row)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="button-small bl-icon"
                  aria-label={m.dev_lab_move_up()}
                  aria-disabled={index === 0}
                  onClick={() => {
                    if (index === 0) return;
                    props.setTeams((current) => moveUnit(current, at, -1));
                    if (active) props.onSelect({ team, index: index - 1 });
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="button-small bl-icon"
                  aria-label={m.dev_lab_move_down()}
                  aria-disabled={index === party.units.length - 1}
                  onClick={() => {
                    if (index === party.units.length - 1) return;
                    props.setTeams((current) => moveUnit(current, at, 1));
                    if (active) props.onSelect({ team, index: index + 1 });
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="button-small bl-icon bl-unit-remove"
                  aria-label={m.dev_lab_remove_unit()}
                  aria-disabled={party.units.length <= 1}
                  onClick={() => {
                    if (party.units.length <= 1) return;
                    props.setTeams((current) => removeUnit(current, at));
                    props.onSelect({
                      team,
                      index: Math.max(0, index - (index <= props.selected.index ? 1 : 0)),
                    });
                  }}
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="bl-add">
        <label className="visually-hidden" htmlFor={`${id}-add`}>
          {m.dev_lab_add_from()}
        </label>
        <select id={`${id}-add`} value={adding} onChange={(event) => setAdding(event.target.value)}>
          <option value="">{m.dev_lab_add_default()}</option>
          <optgroup label={m.dev_lab_add_kind()}>
            {catalog.unitKinds.map((kind) => (
              <option key={kind.id} value={`kind:${kind.id}`}>
                {localized(kind.name, locale, kind.id)}
              </option>
            ))}
          </optgroup>
          <optgroup label={m.dev_lab_preset_unit()}>
            {units.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {nameIn(preset.name, locale)}
              </option>
            ))}
          </optgroup>
        </select>
        <button type="button" className="button-small bl-add-unit" aria-disabled={full} onClick={add}>
          {m.dev_lab_add_unit()}
        </button>
      </div>
      <details className="bl-details bl-formation-details">
        <summary>{m.dev_lab_formation_summary()}</summary>
        <div className="bl-details-body">
          <div className="bl-formation" data-testid={`lab-formation-${team}`}>
            <div className="bl-formation-head">
              <div className="bl-formation-presets">
                {FORMATION_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="button-small"
                    data-active={presetId === preset.id ? "true" : undefined}
                    title={localized(preset.desc, locale, preset.id)}
                    onClick={() => applyPreset(preset.id)}
                  >
                    {localized(preset.shortName, locale, preset.id)}
                  </button>
                ))}
              </div>
            </div>
            <div className="bl-formation-board" aria-label={`${teamText(team)} 9x6`}>
              {FORMATION_Y_ROWS.flatMap((y) =>
                FORMATION_X_COLS.map((x) => {
                  const unitIdx = positions.findIndex((entry) => entry.x === x && entry.y === y);
                  const isSelected =
                    props.selected.team === team && unitIdx === activeUnitIndex && unitIdx >= 0;
                  return (
                    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- 9×6 시각 배치 격자 칸
                    <div
                      key={`${x}:${y}`}
                      className="bl-formation-cell"
                      data-x={x}
                      data-y={y}
                      data-center-x={x === 0 ? "" : undefined}
                      data-occupied={unitIdx >= 0 ? "" : undefined}
                      data-selected={isSelected ? "" : undefined}
                      onClick={() => pickCell(x, y)}
                    >
                      {unitIdx >= 0 ? (
                        <span className="bl-formation-token">{`${team.toUpperCase()}${unitIdx + 1}`}</span>
                      ) : (
                        <span className="bl-formation-dot">{y === 0 && x === 0 ? "0" : "·"}</span>
                      )}
                    </div>
                  );
                }),
              )}
            </div>
          </div>
        </div>
      </details>
      <div className="bl-retreat-row">
        <NumberField
          label={m.dev_lab_retreat()}
          hint={m.dev_lab_retreat_hint()}
          value={party.retreatHpPct}
          min={0}
          max={LAB_LIMITS.retreatMax}
          className="bl-retreat bl-num-compact"
          onChange={(value) =>
            props.setTeams((current) =>
              replaceParty(current, team, { ...current[team], retreatHpPct: value }),
            )
          }
        />
      </div>
    </section>
  );
}
