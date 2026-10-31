// 편집기 확인 창 — F9 만들기, 판 되돌리기, 가져오기, 초안 지우기, 저장 안 한 채 나가기(ADR 38 4·9절)
// <dialog>.showModal()로 연다: 초점을 가두고 Esc는 취소, 닫으면 연 자리로 초점이 돌아간다(브라우저 동작).
// 부모가 request를 넘기면 열리고, null이면 닫힌다. 확인·취소 모두 부모의 onClose를 부른다(확인은 onConfirm 먼저).
import { useEffect, useId, useRef } from "react";
import { m } from "../../paraglide/messages.js";

export interface ConfirmRequest {
  readonly title: string;
  readonly body: readonly string[];
  readonly confirmLabel: string;
  /** 지우기처럼 되돌릴 수 없는 일(확인 버튼을 위험 색으로) */
  readonly danger?: boolean;
  readonly cancelLabel?: string;
  readonly onConfirm: () => void;
}

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (request && !dialog.open) dialog.showModal();
    if (!request && dialog.open) dialog.close();
  }, [request]);
  return (
    <dialog
      ref={ref}
      className="pe-dialog"
      aria-labelledby={titleId}
      data-density="compact"
      onClose={() => {
        if (request) onClose();
      }}
    >
      {request ? (
        <form method="dialog" className="pe-dialog-body">
          <h2 id={titleId} className="pe-dialog-title">
            {request.title}
          </h2>
          {request.body.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <div className="form-actions">
            <button type="submit" value="cancel">
              {request.cancelLabel ?? m.planet_editor_cancel()}
            </button>
            <button
              type="button"
              className={request.danger ? "pe-button-danger" : "button-primary"}
              onClick={() => {
                request.onConfirm();
                onClose();
              }}
            >
              {request.confirmLabel}
            </button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}
