// 첫 접속 1단계 — 이름(D-134·D-445 170·171). 2단계 외형은 LooksStep.tsx(3D 조립, docs/adr/2026-11-11-character-3d.md).
// 이름은 기기에서 같은 규칙 함수(@terra/shared/cyborg parseCyborgName)로 바로 안내하고, [다음] 때 서버에 묻는다(cyborg.nameCheck).
import {
  CYBORG_NAME_MAX_UNITS,
  type CyborgNameProblem,
  cyborgNameUnits,
  parseCyborgName,
} from "@terra/shared/cyborg";
import { type FormEvent, useId, useState } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { nameProblemText } from "./startText.ts";

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
