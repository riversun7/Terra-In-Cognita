// 밸런스 화면 기준 유닛 프리셋 — docs/adr/2026-11-01-balance-screen.md "바뀜 (D-467)". 기준 유닛 판 맨 위.
// - 고르기: 프리셋을 고르면 기준 유닛 칸(1차·무기·인원·판 수·제한 시간)을 채운다. 고르지 않았으면 칸과 같은 프리셋을 보인다.
// - 쓰기(팀이 함께 씀, 서버 DB): [이 프리셋에 저장](칸이 고른 프리셋과 다를 때), [새 프리셋](이름 ko·en), [이름 바꾸기],
//   [지우기](팀이 만든 것)·[팩 값으로](팩에서 고친 것). 판 충돌·없는 프리셋이면 표를 다시 받는다.
// - 이름·확인 창은 <dialog>.showModal()(초점 가둠, Esc = 닫기). DB가 없는 서버는 고르기만.
import {
  BALANCE_PRESET_NAME_MAX,
  type BalancePresetValues,
  type BalancePresetView,
  type BalancePresetsResponse,
} from "@terra/shared/balance";
import { useEffect, useId, useRef, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { LiveMessage, useLiveLines } from "../../ui/LiveMessage.tsx";
import { errorText, presetSourceText } from "./balanceMessages.ts";
import { balanceErrorOf } from "./balanceModel.ts";
import {
  type PresetForm,
  addedPresetId,
  presetMatches,
  presetName,
  presetNameValid,
  presetValuesFrom,
  presetValuesOf,
} from "./balancePresetModel.ts";

type Dialog =
  | { readonly kind: "create" | "rename"; readonly ko: string; readonly en: string }
  | { readonly kind: "delete" | "revert" };

/** <dialog>를 열림 값에 맞춰 열고 닫는다 */
function useModal(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return ref;
}

export function BalancePresets({
  presets,
  writable,
  locale,
  form,
  onPick,
  onChanged,
  onConflict,
}: {
  presets: readonly BalancePresetView[];
  writable: boolean;
  locale: string;
  form: PresetForm;
  onPick: (preset: BalancePresetView) => void;
  onChanged: (response: BalancePresetsResponse) => void;
  onConflict: () => Promise<unknown>;
}) {
  const selectId = useId();
  const titleId = useId();
  const koId = useId();
  const enId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const notice = useLiveLines();
  const problem = useLiveLines();
  const dialogRef = useModal(dialog !== null);

  // 고른 것이 없으면(또는 지워졌으면) 칸과 같은 프리셋
  const picked = presets.find((preset) => preset.id === selectedId);
  const selected = picked ?? presets.find((preset) => presetMatches(preset, form)) ?? null;
  const modified = selected !== null && !presetMatches(selected, form);
  const formValues = presetValuesFrom(selected?.name ?? { ko: "", en: "" }, form);

  const send = async (
    task: () => Promise<BalancePresetsResponse>,
    done: (response: BalancePresetsResponse) => void,
  ): Promise<void> => {
    if (busy) return;
    setBusy(true);
    problem.clear();
    try {
      const response = await task();
      onChanged(response);
      done(response);
      setDialog(null);
    } catch (error: unknown) {
      const info = balanceErrorOf(error);
      if (info.sessionEnded) void refreshSession();
      problem.show([errorText(info.key)]);
      if (info.key === "preset_conflict" || info.key === "unknown_preset") {
        setDialog(null);
        await onConflict();
      }
    } finally {
      setBusy(false);
    }
  };

  const save = (target: BalancePresetView, values: BalancePresetValues): Promise<void> =>
    send(
      () => api.balance.savePreset.mutate({ id: target.id, expectedVersion: target.version, values }),
      () => notice.show([m.dev_balance_preset_saved({ name: presetName(values, locale) })]),
    );

  const confirmDialog = (): void => {
    if (!dialog) return;
    if (dialog.kind === "create" || dialog.kind === "rename") {
      const name = { ko: dialog.ko, en: dialog.en };
      if (!presetNameValid(name)) return;
      if (dialog.kind === "rename") {
        // 이름만 바꾼다: 값은 프리셋 그대로(서버 입력은 값 칸만 받는다)
        if (selected) void save(selected, { ...presetValuesOf(selected), name });
        return;
      }
      const values = presetValuesFrom(name, form);
      if (!values) return;
      void send(
        () => api.balance.savePreset.mutate({ id: null, expectedVersion: 0, values }),
        (response) => {
          setSelectedId(addedPresetId(presets, response.presets));
          notice.show([m.dev_balance_preset_saved({ name: presetName(values, locale) })]);
        },
      );
      return;
    }
    if (!selected) return;
    const target = selected;
    void send(
      () => api.balance.deletePreset.mutate({ id: target.id, expectedVersion: target.version }),
      () => {
        const name = presetName(target, locale);
        if (dialog.kind === "delete") setSelectedId(null);
        notice.show([
          dialog.kind === "delete"
            ? m.dev_balance_preset_deleted({ name })
            : m.dev_balance_preset_reverted({ name }),
        ]);
      },
    );
  };

  const nameDialog = dialog && (dialog.kind === "create" || dialog.kind === "rename") ? dialog : null;
  const nameInvalid = nameDialog !== null && !presetNameValid(nameDialog);
  const dialogTitle =
    dialog === null
      ? ""
      : dialog.kind === "create"
        ? m.dev_balance_preset_new_title()
        : dialog.kind === "rename"
          ? m.dev_balance_preset_rename_title()
          : dialog.kind === "delete"
            ? m.dev_balance_preset_delete_title()
            : m.dev_balance_preset_revert_title();
  const confirmLabel =
    dialog === null
      ? ""
      : dialog.kind === "create"
        ? m.dev_balance_preset_create()
        : dialog.kind === "rename"
          ? m.dev_balance_preset_rename_confirm()
          : dialog.kind === "delete"
            ? m.dev_balance_preset_delete()
            : m.dev_balance_preset_revert();
  const time = (ms: number): string =>
    new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(ms);

  return (
    <div className="bp-presets" data-selected={selected?.id}>
      <div className="field bp-preset-field">
        <label className="field-label" htmlFor={selectId}>
          {m.dev_balance_preset_label()}
        </label>
        <select
          id={selectId}
          className="bp-preset-select"
          value={selected?.id ?? ""}
          onChange={(event) => {
            const preset = presets.find((item) => item.id === event.target.value);
            if (!preset) return;
            setSelectedId(preset.id);
            notice.clear();
            problem.clear();
            onPick(preset);
          }}
        >
          <option value="" disabled>
            {m.dev_balance_preset_placeholder()}
          </option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.source === "pack"
                ? presetName(preset, locale)
                : `${presetName(preset, locale)} · ${presetSourceText(preset.source)}`}
            </option>
          ))}
        </select>
      </div>
      {selected ? (
        <p className="bp-preset-meta" data-source={selected.source}>
          <span className="bp-preset-source">{presetSourceText(selected.source)}</span>
          {selected.updatedBy !== null && selected.updatedAt !== null ? (
            <span>
              {m.dev_balance_preset_meta({ name: selected.updatedBy, time: time(selected.updatedAt) })}
            </span>
          ) : null}
        </p>
      ) : null}
      {modified ? <p className="field-hint bp-preset-modified">{m.dev_balance_preset_modified()}</p> : null}
      <p className="field-hint">{writable ? m.dev_balance_preset_hint() : m.dev_balance_preset_readonly()}</p>
      {writable ? (
        <div className="bp-preset-actions">
          {selected && modified && formValues ? (
            <button
              type="button"
              className="button-small button-primary bp-preset-save"
              aria-disabled={busy}
              onClick={() => void save(selected, formValues)}
            >
              {m.dev_balance_preset_save()}
            </button>
          ) : null}
          <button
            type="button"
            className="button-small bp-preset-new"
            aria-disabled={busy || form.primaries === null}
            onClick={() => {
              if (form.primaries !== null) setDialog({ kind: "create", ko: "", en: "" });
            }}
          >
            {m.dev_balance_preset_new()}
          </button>
          {selected ? (
            <button
              type="button"
              className="button-small bp-preset-rename"
              aria-disabled={busy}
              onClick={() => setDialog({ kind: "rename", ko: selected.name.ko, en: selected.name.en })}
            >
              {m.dev_balance_preset_rename()}
            </button>
          ) : null}
          {selected?.source === "custom" ? (
            <button
              type="button"
              className="button-small bp-preset-delete"
              aria-disabled={busy}
              onClick={() => setDialog({ kind: "delete" })}
            >
              {m.dev_balance_preset_delete()}
            </button>
          ) : null}
          {selected?.source === "edited" ? (
            <button
              type="button"
              className="button-small bp-preset-revert"
              aria-disabled={busy}
              onClick={() => setDialog({ kind: "revert" })}
            >
              {m.dev_balance_preset_revert()}
            </button>
          ) : null}
        </div>
      ) : null}
      <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
      {dialog === null ? <LiveMessage tone="error" lines={problem.lines} version={problem.version} /> : null}

      <dialog
        ref={dialogRef}
        className="bp-dialog"
        aria-labelledby={titleId}
        data-density="compact"
        onClose={() => setDialog(null)}
      >
        {dialog ? (
          <form
            className="bp-dialog-body"
            onSubmit={(event) => {
              event.preventDefault();
              confirmDialog();
            }}
          >
            <h2 id={titleId} className="bp-dialog-title">
              {dialogTitle}
            </h2>
            {dialog.kind === "create" ? <p>{m.dev_balance_preset_new_body()}</p> : null}
            {dialog.kind === "delete" && selected ? (
              <p>{m.dev_balance_preset_delete_body({ name: presetName(selected, locale) })}</p>
            ) : null}
            {dialog.kind === "revert" && selected ? (
              <p>{m.dev_balance_preset_revert_body({ name: presetName(selected, locale) })}</p>
            ) : null}
            {nameDialog ? (
              <>
                <div className="field">
                  <label className="field-label" htmlFor={koId}>
                    {m.dev_balance_preset_name_ko()}
                  </label>
                  <input
                    id={koId}
                    className="input bp-preset-name-ko"
                    autoComplete="off"
                    value={nameDialog.ko}
                    aria-invalid={nameInvalid || undefined}
                    onChange={(event) => setDialog({ ...nameDialog, ko: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={enId}>
                    {m.dev_balance_preset_name_en()}
                  </label>
                  <input
                    id={enId}
                    className="input bp-preset-name-en"
                    autoComplete="off"
                    value={nameDialog.en}
                    aria-invalid={nameInvalid || undefined}
                    onChange={(event) => setDialog({ ...nameDialog, en: event.target.value })}
                  />
                </div>
                <p
                  className={
                    nameInvalid && (nameDialog.ko !== "" || nameDialog.en !== "")
                      ? "field-error"
                      : "field-hint"
                  }
                >
                  {m.dev_balance_preset_name_invalid({ max: BALANCE_PRESET_NAME_MAX })}
                </p>
              </>
            ) : null}
            <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
            <div className="form-actions">
              <button type="button" onClick={() => setDialog(null)}>
                {m.dev_balance_preset_cancel()}
              </button>
              <button
                type="submit"
                className="button-primary bp-dialog-confirm"
                aria-disabled={busy || nameInvalid}
              >
                {confirmLabel}
              </button>
            </div>
          </form>
        ) : null}
      </dialog>
    </div>
  );
}
