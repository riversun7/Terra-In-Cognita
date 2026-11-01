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
import { useId, useState } from "react";
import { m } from "../../../paraglide/messages.js";
import { NumberField } from "./fields.tsx";
import {
  DEFAULT_UNIT_PRESET,
  type Selection,
  type Teams,
  addUnit,
  moveUnit,
  nameIn,
  partyPresets,
  removeUnit,
  replaceParty,
  unitPresets,
  updateUnit,
  withRow,
} from "./labModel.ts";
import { itemName, localized, rowText, teamText, unitTitle } from "./labMessages.ts";
import { PresetBar } from "./PresetBar.tsx";

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
  const full = party.units.length >= LAB_LIMITS.partyMax;
  const units = unitPresets(props.presets?.presets ?? []);

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

  return (
    <section className="bp-panel bl-team" data-team={team} aria-labelledby={`${id}-title`}>
      <div className="bp-panel-head">
        <h2 id={`${id}-title`} className="bp-title bl-team-title">
          {teamText(team)}
          <span className="bl-count">
            {m.dev_lab_party_count({ count: party.units.length, max: LAB_LIMITS.partyMax })}
          </span>
        </h2>
      </div>
      <PresetBar
        kind="party"
        presets={partyPresets(props.presets?.presets ?? [])}
        writable={props.presets?.writable ?? false}
        locale={locale}
        current={() => ({ kind: "party", data: party })}
        onLoad={(value) => {
          if (value.kind !== "party") return;
          props.setTeams((current) => replaceParty(current, team, value.data));
          props.onSelect({ team, index: 0 });
        }}
        onList={props.onPresets}
        onNotice={props.onNotice}
      />
      <ol className="bl-units">
        {party.units.map((unit, index) => {
          const at = { team, index };
          const active = props.selected.team === team && props.selected.index === index;
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
                  {weapon}
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
      <NumberField
        label={m.dev_lab_retreat()}
        hint={m.dev_lab_retreat_hint()}
        value={party.retreatHpPct}
        min={0}
        max={LAB_LIMITS.retreatMax}
        className="bl-retreat"
        onChange={(value) =>
          props.setTeams((current) => replaceParty(current, team, { ...current[team], retreatHpPct: value }))
        }
      />
    </section>
  );
}
