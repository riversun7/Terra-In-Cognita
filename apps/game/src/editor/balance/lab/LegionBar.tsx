// 군단 파티 편성 줄 — 팀 A·B 각 카드 위에 둔다.
// 1) 파티 탭(파티 1, 파티 2 …) + 파티 복제 추가(.rp-party-add) + 파티 빼기(.rp-party-remove)
// 2) 저장된 파티 프리셋(샘플 + 팀 프리셋)을 골라 곧바로 군단의 새 파티로 추가
// 3) 군단 통째로 저장·불러오기·지우기(이 기기 저장, SavedLegion)
import type { LabParty, LabPresetView, LabTeam } from "@terra/shared/battleLab";
import { REPORT_LIMITS } from "@terra/shared/battleReport";
import { useId, useState } from "react";
import { m } from "../../../paraglide/messages.js";
import { nameIn, partyPresets } from "./labModel.ts";
import { type SavedLegion, legionUnitCount } from "./legionPresets.ts";

export function LegionBar(props: {
  readonly team: LabTeam;
  readonly firstParty: LabParty;
  readonly extraParties: readonly LabParty[];
  readonly at: number;
  readonly presets: readonly LabPresetView[];
  readonly savedLegions: readonly SavedLegion[];
  readonly locale: string;
  /** 군단전 모드이거나 파티가 2개 이상이면 파티 불러오기·군단 저장 줄을 바로 펼친다 */
  readonly expanded: boolean;
  readonly onPick: (index: number) => void;
  readonly onAddClone: () => void;
  readonly onAddPresetParty: (party: LabParty, label: string) => void;
  readonly onRemove: () => void;
  readonly onSaveLegion: (name: string) => void;
  readonly onLoadLegion: (legion: SavedLegion) => void;
  readonly onDeleteLegion: (legion: SavedLegion) => void;
}) {
  const id = useId();
  const [presetPick, setPresetPick] = useState("");
  const [legionPick, setLegionPick] = useState("");
  const [legionName, setLegionName] = useState("");

  const label = props.team.toUpperCase();
  const allParties = [props.firstParty, ...props.extraParties];
  const count = allParties.length;
  const totalUnits = legionUnitCount(props.firstParty, props.extraParties);
  const full = count >= REPORT_LIMITS.legionPartiesEditMax;

  const savedParties = partyPresets(props.presets);
  const sampleParties = savedParties.filter((entry) => entry.source === "sample");
  const teamParties = savedParties.filter((entry) => entry.source === "team");
  const pickedPreset = savedParties.find((entry) => entry.id === presetPick) ?? null;
  const pickedLegion = props.savedLegions.find((entry) => entry.id === legionPick) ?? null;

  const addFromPreset = (): void => {
    if (full || !pickedPreset) return;
    props.onAddPresetParty(pickedPreset.data, nameIn(pickedPreset.name, props.locale));
    setPresetPick("");
  };

  const saveCurrentLegion = (): void => {
    const trimmed = legionName.trim();
    if (!trimmed) return;
    props.onSaveLegion(trimmed);
    setLegionName("");
  };

  return (
    <div className="rp-partybar bl-legion-bar" data-team={props.team}>
      <div className="bl-legion-head">
        <div className="rp-party-tabs" role="tablist" aria-label={m.dev_report_party_label({ team: label })}>
          {allParties.map((party, index) => (
            <button
              key={index}
              type="button"
              role="tab"
              aria-selected={props.at === index}
              className="rp-party-tab"
              data-party={index}
              onClick={() => props.onPick(index)}
            >
              {`${m.dev_report_party_tab({ n: index + 1 })} (${party.units.length})`}
            </button>
          ))}
          {!full ? (
            <button type="button" className="button-small rp-party-add" onClick={props.onAddClone}>
              {m.dev_report_party_add()}
            </button>
          ) : null}
          {props.at > 0 ? (
            <button type="button" className="button-small rp-party-remove" onClick={props.onRemove}>
              {m.dev_report_party_remove()}
            </button>
          ) : null}
        </div>
        {count > 1 ? (
          <span className="bl-legion-meta">
            {m.dev_lab_legion_summary({ parties: count, units: totalUnits })}
          </span>
        ) : null}
      </div>

      {props.expanded || count > 1 ? (
        <div className="bl-legion-composer">
          {!full && savedParties.length > 0 ? (
            <div className="bl-legion-add-row">
              <label className="visually-hidden" htmlFor={`${id}-add-preset`}>
                {m.dev_lab_legion_add_preset_pick()}
              </label>
              <select
                id={`${id}-add-preset`}
                className="bl-legion-add-preset"
                value={presetPick}
                onChange={(event) => setPresetPick(event.target.value)}
              >
                <option value="">{m.dev_lab_legion_add_preset_pick()}</option>
                {teamParties.length > 0 ? (
                  <optgroup label={m.dev_lab_preset_team()}>
                    {teamParties.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {nameIn(entry.name, props.locale)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                <optgroup label={m.dev_lab_preset_samples()}>
                  {sampleParties.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {nameIn(entry.name, props.locale)}
                    </option>
                  ))}
                </optgroup>
              </select>
              <button
                type="button"
                className="button-small bl-legion-add-btn"
                aria-disabled={!pickedPreset}
                onClick={addFromPreset}
              >
                {m.dev_lab_legion_add_preset()}
              </button>
            </div>
          ) : null}

          <details className="bl-details bl-legion-presets">
            <summary>{m.dev_lab_legion_preset_toggle()}</summary>
            <div className="bl-details-body">
              <div className="bl-legion-save-row">
                <label className="visually-hidden" htmlFor={`${id}-legion-name`}>
                  {m.dev_lab_legion_preset_name()}
                </label>
                <input
                  id={`${id}-legion-name`}
                  className="input bl-legion-name-input"
                  type="text"
                  maxLength={40}
                  placeholder={m.dev_lab_legion_preset_name()}
                  value={legionName}
                  onChange={(event) => setLegionName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      saveCurrentLegion();
                    }
                  }}
                />
                <button
                  type="button"
                  className="button-small bl-legion-save-btn"
                  aria-disabled={legionName.trim() === ""}
                  onClick={saveCurrentLegion}
                >
                  {m.dev_lab_legion_preset_save()}
                </button>
              </div>
              {props.savedLegions.length > 0 ? (
                <div className="bl-legion-load-row">
                  <label className="visually-hidden" htmlFor={`${id}-legion-pick`}>
                    {m.dev_lab_legion_preset_pick()}
                  </label>
                  <select
                    id={`${id}-legion-pick`}
                    className="bl-legion-pick"
                    value={legionPick}
                    onChange={(event) => setLegionPick(event.target.value)}
                  >
                    <option value="">{m.dev_lab_legion_preset_pick()}</option>
                    {props.savedLegions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {`${entry.name} (${m.dev_lab_legion_summary({
                          parties: entry.parties.length,
                          units: entry.parties.reduce((acc, party) => acc + party.units.length, 0),
                        })})`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="button-small bl-legion-load-btn"
                    aria-disabled={!pickedLegion}
                    onClick={() => {
                      if (pickedLegion) props.onLoadLegion(pickedLegion);
                    }}
                  >
                    {m.dev_lab_legion_preset_load()}
                  </button>
                  <button
                    type="button"
                    className="button-small bl-legion-delete-btn"
                    aria-disabled={!pickedLegion}
                    onClick={() => {
                      if (!pickedLegion) return;
                      props.onDeleteLegion(pickedLegion);
                      setLegionPick("");
                    }}
                  >
                    {m.dev_lab_legion_preset_delete()}
                  </button>
                </div>
              ) : (
                <p className="field-hint">{m.dev_lab_legion_preset_empty()}</p>
              )}
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
}
