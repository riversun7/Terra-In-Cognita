// 첫 접속 1·2단계 — 이름(D-134·D-445 170·171), 외형(D-6040 "전부다": 프리셋·무작위·부위·색이 한 화면, D-445 172).
// 이름은 기기에서 같은 규칙 함수(@terra/shared/cyborg parseCyborgName)로 바로 안내하고, [다음] 때 서버에 묻는다(cyborg.nameCheck).
// 무작위 외형은 꾸밈이라 기기 난수로 뽑는다(서버는 ID만 본다).
import {
  CYBORG_COLORS,
  CYBORG_COLOR_IDS,
  CYBORG_COLOR_SLOTS,
  CYBORG_LOOK_PARTS,
  CYBORG_LOOK_SLOTS,
  CYBORG_NAME_MAX_UNITS,
  CYBORG_PRESETS,
  type CyborgAppearance,
  type CyborgNameProblem,
  cyborgNameUnits,
  parseCyborgName,
  randomCyborgAppearance,
  stepCyborgPart,
} from "@terra/shared/cyborg";
import { type FormEvent, useId, useState } from "react";
import { CyborgAvatar } from "../cyborg/CyborgAvatar.tsx";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { colorText, nameProblemText, presetText, slotText } from "./startText.ts";

type NameState =
  | { readonly kind: "idle" }
  | { readonly kind: "checking" }
  | { readonly kind: "problem"; readonly code: CyborgNameProblem | "taken" }
  | { readonly kind: "failed" };

export function NameStep({
  name,
  onName,
  onDone,
}: {
  name: string;
  onName: (value: string) => void;
  onDone: () => void;
}) {
  const id = useId();
  const [state, setState] = useState<NameState>({ kind: "idle" });
  const parsed = parseCyborgName(name);
  // 친 동안에는 글자 문제만 바로 보인다(빈 칸·짧음은 [다음]을 눌렀을 때)
  const live = !parsed.ok && name.trim() !== "" && parsed.problem !== "too_short" ? parsed.problem : null;
  const shown = state.kind === "problem" ? state.code : live;
  const units = parsed.ok ? cyborgNameUnits(parsed.display) : Math.min(cyborgNameUnits(name.trim()), 99);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (state.kind === "checking") return;
    if (!parsed.ok) {
      setState({ kind: "problem", code: parsed.problem });
      return;
    }
    setState({ kind: "checking" });
    try {
      const answer = await api.cyborg.nameCheck.query(
        { name: parsed.display },
        { signal: AbortSignal.timeout(10_000) },
      );
      if (answer.ok) {
        setState({ kind: "idle" });
        onDone();
      } else setState({ kind: "problem", code: answer.code });
    } catch {
      setState({ kind: "failed" });
    }
  };

  return (
    <form className="start-name" onSubmit={(event) => void submit(event)} noValidate>
      <p className="start-lead">{m.start_intro()}</p>
      <label className="field-label" htmlFor={`${id}-name`}>
        {m.start_name_label()}
      </label>
      <input
        id={`${id}-name`}
        className="input start-name-input"
        value={name}
        onChange={(event) => {
          onName(event.target.value);
          if (state.kind !== "checking") setState({ kind: "idle" });
        }}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={32}
        aria-invalid={shown !== null}
        aria-describedby={`${id}-hint ${id}-problem`}
      />
      <p id={`${id}-hint`} className="start-hint">
        {m.start_name_hint()}{" "}
        <span className="start-count">
          {m.start_name_count({ used: String(units), max: String(CYBORG_NAME_MAX_UNITS) })}
        </span>
      </p>
      <p id={`${id}-problem`} className="start-field-problem" role="status">
        {state.kind === "checking"
          ? m.start_name_checking()
          : state.kind === "failed"
            ? m.start_name_check_failed()
            : shown !== null
              ? nameProblemText(shown)
              : ""}
      </p>
      <div className="start-nav">
        <button type="submit" className="button-primary" aria-disabled={state.kind === "checking"}>
          {m.start_next()}
        </button>
      </div>
    </form>
  );
}

export function LooksStep({
  look,
  onLook,
}: {
  look: CyborgAppearance;
  onLook: (next: CyborgAppearance) => void;
}) {
  const id = useId();
  return (
    <div className="start-looks">
      <div className="start-looks-preview">
        <CyborgAvatar look={look} className="start-avatar" label={m.start_looks_preview()} />
        <button
          type="button"
          className="button-small start-random"
          onClick={() => onLook(randomCyborgAppearance((count) => Math.floor(Math.random() * count)))}
        >
          {m.start_looks_random()}
        </button>
      </div>
      <fieldset className="start-group">
        <legend className="start-group-title">{m.start_looks_presets()}</legend>
        <div className="start-presets">
          {CYBORG_PRESETS.map((preset) => {
            const active =
              CYBORG_LOOK_SLOTS.every((slot) => preset.look[slot] === look[slot]) &&
              CYBORG_COLOR_SLOTS.every((slot) => preset.look[slot] === look[slot]);
            return (
              <button
                key={preset.id}
                type="button"
                className="start-preset"
                aria-pressed={active}
                onClick={() => onLook(preset.look)}
              >
                <CyborgAvatar look={preset.look} variant="face" className="start-preset-face" />
                <span>{presetText(preset.id)}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="start-group">
        <legend className="start-group-title">{m.start_looks_parts()}</legend>
        {CYBORG_LOOK_SLOTS.map((slot) => {
          const list: readonly string[] = CYBORG_LOOK_PARTS[slot];
          const at = list.indexOf(look[slot]) + 1;
          return (
            <div key={slot} className="start-part">
              <span className="start-part-name" id={`${id}-${slot}`}>
                {slotText(slot)}
              </span>
              <button
                type="button"
                className="button-small start-part-step"
                aria-label={m.start_looks_prev({ slot: slotText(slot) })}
                onClick={() => onLook(stepCyborgPart(look, slot, -1))}
              >
                ‹
              </button>
              <span className="start-part-value" aria-labelledby={`${id}-${slot}`} aria-live="polite">
                {m.start_looks_part_of({ index: String(at), count: String(list.length) })}
              </span>
              <button
                type="button"
                className="button-small start-part-step"
                aria-label={m.start_looks_next({ slot: slotText(slot) })}
                onClick={() => onLook(stepCyborgPart(look, slot, 1))}
              >
                ›
              </button>
            </div>
          );
        })}
      </fieldset>
      {CYBORG_COLOR_SLOTS.map((slot) => (
        <fieldset key={slot} className="start-group">
          <legend className="start-group-title">
            {slot === "primary" ? m.start_looks_color_primary() : m.start_looks_color_accent()}
          </legend>
          <div className="start-swatches">
            {CYBORG_COLOR_IDS.map((color) => (
              <label key={color} className="start-swatch" data-color={color}>
                <input
                  type="radio"
                  name={`${id}-${slot}`}
                  checked={look[slot] === color}
                  onChange={() => onLook({ ...look, [slot]: color })}
                />
                {/* 칠 색은 세계의 색(테마와 상관없다)이라 CSS 값이 아니라 목록 값을 바로 쓴다 */}
                <span
                  className="start-swatch-chip"
                  aria-hidden="true"
                  style={{ background: CYBORG_COLORS[color] }}
                />
                <span className="visually-hidden">{colorText(color)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <p className="start-hint">{m.start_looks_note()}</p>
    </div>
  );
}
