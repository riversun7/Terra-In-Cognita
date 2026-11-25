// 가입비를 받는 나라를 고르면 띄우는 경고 창(사용자 결정 2026-11-25 "가입비를 받는나라에서 시작을 할 수 없다. 경고창만 띄워라").
// 미소속으로 시작한 사람은 그 나라에 들 돈이 없어 시작할 수 없다. 창은 알리기만 하고 고른 나라는 바뀌지 않는다(서버도 만들기를 거절한다).
// <dialog>.showModal()로 연다(초점을 가두고 Esc는 닫기, 닫으면 연 자리로 초점이 돌아간다).
import type { CreationFaction } from "@terra/shared/cyborg";
import { useEffect, useId, useRef } from "react";
import { m } from "../paraglide/messages.js";
import { formatNumber, localName } from "../roster/rosterText.ts";

export function FeeNationDialog({
  faction,
  onClose,
}: {
  /** 경고할 나라(없으면 닫힘) */
  faction: CreationFaction | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const open = faction !== null;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="start-fee-dialog"
      aria-labelledby={titleId}
      onClose={() => {
        if (open) onClose();
      }}
    >
      {faction ? (
        <div className="start-fee-dialog-panel" data-faction={faction.id}>
          <h2 id={titleId} className="start-fee-dialog-title">
            {m.start_fee_dialog_title()}
          </h2>
          <p>
            {m.start_fee_dialog_body({
              nation: localName(faction.name, String(faction.id)),
              amount: formatNumber(Number(faction.entryFee ?? "0")),
            })}
          </p>
          <div className="form-actions">
            <button type="button" className="button-primary" onClick={onClose}>
              {m.start_fee_dialog_ok()}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
