// 3D 외형 한 번 고르기 창 — 질문 961 나(docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-11, 961·963)").
// 3D 외형을 고르기 전에 만든 사이보그(cyborg.get lookPick)가 사이보그 화면의 [외형 고르기]로 연다. 만들기 화면의 외형 단계(start/LooksStep.tsx —
// 3D 미리 보기·프리셋·부위·색)를 그대로 쓰고, 처음 값은 옛 외형에서 옮긴 3D 외형이다.
// - [이 모습으로 정하기] → 한 번 더 묻고(정하면 다시 바꿀 수 없다) → WebSocket cyborg_look(프로토콜 21). 판정·저장은 서버가 한다
//   (이미 골랐으면 look_locked). 성공하면 창을 닫고 사이보그 자료를 다시 받는다 — 서버가 lookPick을 거두면 [외형 고르기]가 사라진다.
// - <dialog>.showModal(): 초점을 가두고 Esc·[닫기]로 닫는다(보내는 중에는 닫지 않는다).
// 지연 조각: 사이보그 화면이 [외형 고르기]를 누를 때 받는다(미리 보기 엔진·외형 단계 코드가 사이보그 화면 조각에 들지 않게).
import type { CyborgResultCode } from "@terra/protocol";
import { type CharacterLook, legacyAppearanceOf } from "@terra/shared/characterLook";
import { useEffect, useId, useRef, useState } from "react";
import { m } from "../paraglide/messages.js";
import { sendCyborgCommand } from "../start/cyborgCommands.ts";
import { markCyborgAppearance } from "../start/cyborgGate.ts";
import { commandErrorText } from "../start/startText.ts";
import { LooksStep } from "../start/LooksStep.tsx";
import "../holdings/holdings.css";
import "./lookPick.css";

type PickState =
  | { readonly kind: "editing" }
  | { readonly kind: "confirm" }
  | { readonly kind: "saving" }
  | { readonly kind: "failed"; readonly text: string };

function failText(code: CyborgResultCode | "offline" | "timeout"): string {
  return code === "appearance_invalid" ? m.cyborg_look_pick_invalid() : commandErrorText(code);
}

export default function LookPick({
  initial,
  onClose,
  onSaved,
}: {
  /** 처음 보일 외형(옛 외형에서 옮긴 값) */
  initial: CharacterLook;
  onClose: () => void;
  /** 서버가 저장했다(look_locked도 — 이미 고른 사이보그라 자료를 다시 받아 단추를 거둔다) */
  onSaved: () => void;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [look, setLook] = useState(initial);
  const [state, setState] = useState<PickState>({ kind: "editing" });
  const saving = state.kind === "saving";

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const save = async (): Promise<void> => {
    setState({ kind: "saving" });
    const result = await sendCyborgCommand({ t: "cyborg_look", look });
    if (result.ok) {
      markCyborgAppearance(legacyAppearanceOf(look));
      onSaved();
      return;
    }
    if (result.code === "look_locked") onSaved();
    setState({ kind: "failed", text: failText(result.code) });
  };

  return (
    <dialog
      ref={ref}
      className="holdings-dialog cyborg-look-pick"
      aria-labelledby={titleId}
      aria-busy={saving ? "true" : undefined}
      onCancel={(event) => {
        // 보내는 중에는 Esc로 닫지 않는다(결과를 기다린다)
        if (saving) event.preventDefault();
      }}
      onClose={onClose}
    >
      <div className="holdings-dialog-panel cyborg-look-pick-panel">
        <div className="holdings-dialog-head">
          <h2 id={titleId} className="holdings-dialog-title">
            {m.cyborg_look_pick()}
          </h2>
          <button
            type="button"
            className="button-small"
            aria-disabled={saving ? "true" : undefined}
            onClick={() => {
              if (!saving) ref.current?.close();
            }}
          >
            {m.cyborg_look_pick_close()}
          </button>
        </div>
        <p className="roster-note">{m.cyborg_look_pick_lead()}</p>
        <LooksStep look={look} onLook={setLook} />
        <div className="cyborg-look-pick-foot" role="group" aria-label={m.cyborg_look_pick()}>
          <p className="cyborg-look-pick-status" role="status" data-state={state.kind}>
            {state.kind === "confirm"
              ? m.cyborg_look_pick_confirm()
              : state.kind === "saving"
                ? m.cyborg_look_pick_saving()
                : state.kind === "failed"
                  ? state.text
                  : ""}
          </p>
          {state.kind === "confirm" || state.kind === "saving" ? (
            <div className="cyborg-look-pick-actions">
              <button
                type="button"
                aria-disabled={saving ? "true" : undefined}
                onClick={() => {
                  if (!saving) setState({ kind: "editing" });
                }}
              >
                {m.cyborg_look_pick_confirm_no()}
              </button>
              <button
                type="button"
                className="button-primary cyborg-look-pick-confirm"
                aria-disabled={saving ? "true" : undefined}
                onClick={() => {
                  if (!saving) void save();
                }}
              >
                {m.cyborg_look_pick_confirm_yes()}
              </button>
            </div>
          ) : (
            <div className="cyborg-look-pick-actions">
              <button
                type="button"
                className="button-primary cyborg-look-pick-save"
                onClick={() => setState({ kind: "confirm" })}
              >
                {m.cyborg_look_pick_save()}
              </button>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
