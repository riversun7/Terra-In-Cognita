// 프리셋 막대(유닛·파티 같은 틀) — 고르기(샘플·팀 묶음), [불러오기]·[새로 저장]·[덮어쓰기]·[이름 바꾸기]·[복제]·[지우기].
// 팀 프리셋은 DB(서버 battleLab.savePreset·deletePreset, 줄 판으로 충돌), 샘플은 읽기 전용(복제해서 고친다).
// 쓰기 권한이 없거나(writable false) 샘플을 고르면 쓰기 단추를 끈다. 서버는 바뀐 목록을 돌려준다.
import type {
  LabParty,
  LabPresetListResponse,
  LabPresetSaveInput,
  LabPresetView,
  LabUnit,
} from "@terra/shared/battleLab";
import type { LocalizedName } from "@terra/shared/roster";
import { useId, useState } from "react";
import { refreshSession } from "../../../auth/session.ts";
import { api } from "../../../net/api.ts";
import { m } from "../../../paraglide/messages.js";
import { type ConfirmRequest, ConfirmDialog, NameDialog, type NameRequest } from "./fields.tsx";
import { copyName, labErrorOf, nameIn } from "./labModel.ts";
import { labErrorText } from "./labMessages.ts";

/** 프리셋 값(종류 + 값) */
export type PresetValue =
  | { readonly kind: "unit"; readonly data: LabUnit }
  | { readonly kind: "party"; readonly data: LabParty };

const valueOf = (preset: LabPresetView): PresetValue =>
  preset.kind === "unit" ? { kind: "unit", data: preset.data } : { kind: "party", data: preset.data };

/** 저장 입력(target이 있으면 그 줄·그 판을 바꾼다) */
function inputOf(value: PresetValue, name: LocalizedName, target?: LabPresetView): LabPresetSaveInput {
  const where = target ? { id: target.id, expectedVersion: target.version } : {};
  return value.kind === "unit"
    ? { ...where, kind: "unit", name, data: value.data }
    : { ...where, kind: "party", name, data: value.data };
}

export function PresetBar(props: {
  readonly kind: "unit" | "party";
  /** 이 종류의 프리셋만 */
  readonly presets: readonly LabPresetView[];
  readonly writable: boolean;
  readonly locale: string;
  /** 저장할 지금 값 */
  readonly current: () => PresetValue;
  readonly onLoad: (value: PresetValue) => void;
  readonly onList: (list: LabPresetListResponse) => void;
  readonly onNotice: (line: string, tone: "success" | "error") => void;
}) {
  const id = useId();
  const [chosen, setChosen] = useState("");
  const [name, setName] = useState<NameRequest | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const preset = props.presets.find((entry) => entry.id === chosen) ?? null;
  const team = preset?.source === "team";
  const samples = props.presets.filter((entry) => entry.source === "sample");
  const teams = props.presets.filter((entry) => entry.source === "team");

  const run = (
    work: () => Promise<LabPresetListResponse>,
    done: string,
    select?: (list: LabPresetListResponse) => string,
  ) => {
    setBusy(true);
    work()
      .then(
        (list) => {
          props.onList(list);
          if (select) setChosen(select(list));
          props.onNotice(done, "success");
        },
        (error: unknown) => {
          const info = labErrorOf(error);
          if (info.sessionEnded) void refreshSession();
          props.onNotice(labErrorText(info.key), "error");
        },
      )
      .finally(() => setBusy(false));
  };

  /** 새 줄을 만들고 목록에서 그 줄을 고른다(이름이 같은 마지막 팀 프리셋) */
  const createNew = (nameValue: LocalizedName, value: PresetValue): void =>
    run(
      () => api.battleLab.savePreset.mutate(inputOf(value, nameValue)),
      m.dev_lab_preset_saved({ name: nameIn(nameValue, props.locale) }),
      (list) =>
        list.presets.findLast((entry) => entry.source === "team" && entry.name.ko === nameValue.ko)?.id ?? "",
    );

  const update = (target: LabPresetView, nameValue: LocalizedName, value: PresetValue): void =>
    run(
      () => api.battleLab.savePreset.mutate(inputOf(value, nameValue, target)),
      m.dev_lab_preset_saved({ name: nameIn(nameValue, props.locale) }),
    );

  const writeOff = !props.writable || busy;
  return (
    <div className="bl-presets" data-kind={props.kind}>
      <div className="bl-preset-main">
        <label className="visually-hidden" htmlFor={`${id}-pick`}>
          {props.kind === "unit" ? m.dev_lab_preset_unit() : m.dev_lab_preset_party()}
        </label>
        <select
          id={`${id}-pick`}
          className="bl-preset-select"
          value={chosen}
          onChange={(event) => setChosen(event.target.value)}
        >
          <option value="">
            {props.kind === "unit" ? m.dev_lab_preset_unit_pick() : m.dev_lab_preset_party_pick()}
          </option>
          {teams.length > 0 ? (
            <optgroup label={m.dev_lab_preset_team()}>
              {teams.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {nameIn(entry.name, props.locale)}
                </option>
              ))}
            </optgroup>
          ) : null}
          <optgroup label={m.dev_lab_preset_samples()}>
            {samples.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {nameIn(entry.name, props.locale)}
              </option>
            ))}
          </optgroup>
        </select>
        <button
          type="button"
          className="button-small bl-preset-load"
          aria-disabled={!preset}
          onClick={() => {
            if (!preset) return;
            props.onLoad(valueOf(preset));
            props.onNotice(m.dev_lab_preset_loaded({ name: nameIn(preset.name, props.locale) }), "success");
          }}
        >
          {m.dev_lab_preset_load()}
        </button>
        <button
          type="button"
          className="button-small bl-preset-new"
          aria-disabled={writeOff}
          onClick={() => {
            if (writeOff) return;
            setName({
              title: m.dev_lab_preset_new_title(),
              initial: preset ? copyName(preset.name) : { ko: "", en: "" },
              confirm: m.dev_lab_preset_save(),
              onConfirm: (value) => createNew(value, props.current()),
            });
          }}
        >
          {m.dev_lab_preset_new()}
        </button>
      </div>
      <div className="bl-preset-actions">
        <button
          type="button"
          className="button-small bl-preset-overwrite"
          aria-disabled={writeOff || !team}
          onClick={() => {
            if (writeOff || !preset || !team) return;
            update(preset, preset.name, props.current());
          }}
        >
          {m.dev_lab_preset_overwrite()}
        </button>
        <button
          type="button"
          className="button-small bl-preset-rename"
          aria-disabled={writeOff || !team}
          onClick={() => {
            if (writeOff || !preset || !team) return;
            setName({
              title: m.dev_lab_preset_rename_title(),
              initial: preset.name,
              confirm: m.dev_lab_preset_rename(),
              onConfirm: (value) => update(preset, value, valueOf(preset)),
            });
          }}
        >
          {m.dev_lab_preset_rename()}
        </button>
        <button
          type="button"
          className="button-small bl-preset-copy"
          aria-disabled={writeOff || !preset}
          onClick={() => {
            if (writeOff || !preset) return;
            createNew(copyName(preset.name), valueOf(preset));
          }}
        >
          {m.dev_lab_preset_copy()}
        </button>
        <button
          type="button"
          className="button-small bl-preset-delete"
          aria-disabled={writeOff || !team}
          onClick={() => {
            if (writeOff || !preset || !team) return;
            setConfirm({
              title: m.dev_lab_preset_delete_title(),
              body: m.dev_lab_preset_delete_body({ name: nameIn(preset.name, props.locale) }),
              confirm: m.dev_lab_preset_delete(),
              onConfirm: () =>
                run(
                  () => api.battleLab.deletePreset.mutate({ id: preset.id, expectedVersion: preset.version }),
                  m.dev_lab_preset_deleted({ name: nameIn(preset.name, props.locale) }),
                  () => "",
                ),
            });
          }}
        >
          {m.dev_lab_preset_delete()}
        </button>
      </div>
      {!props.writable ? <p className="field-hint">{m.dev_lab_preset_read_only()}</p> : null}
      <NameDialog request={name} onClose={() => setName(null)} />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
