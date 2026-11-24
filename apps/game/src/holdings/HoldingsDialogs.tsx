// 보유 물건 창 둘 — 칸 고르기(옛 EquipmentSelectionModal)와 효과 교체 확인(D-501). <dialog>.showModal()로 연다(초점을 가두고 Esc는 닫기,
// 닫으면 연 자리로 초점이 돌아간다). 좁으면 화면 전체, 넓으면 가운데 판(복귀 요약 창과 같은 폭 경계).
// - 칸 고르기: 지금 장착(있으면 [해제]) + 장착할 수 있는 든 물건(칸 종류가 같은 장비, 내구도 막대). 파손은 누를 수 없고 "수리 필요"를
//   보인다(옛 화면과 같다, N49 286). 고르면 서버에 item_equip — 성공하면 창이 닫히고, 실패하면 창 안에 알림.
// - 교체 확인: "지금 버프가 사라집니다" + 사라질 효과 이름. [그래도 사용]이면 confirm으로 다시 보낸다.
import type { RosterNames } from "@terra/shared/roster";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { m } from "../paraglide/messages.js";
import { formatNumber, localName } from "../roster/rosterText.ts";
import { DurabilityLine, HoldingTitle, NoticeLine, StatChips } from "./HoldingParts.tsx";
import { type UnitHoldings, isBroken, slotChoices } from "./holdingsModel.ts";
import { holdingName, slotKindLabel } from "./holdingsText.ts";
import type { HoldingsController } from "./useHoldings.ts";

/** open이 참이면 열고 거짓이면 닫는 <dialog>. 브라우저가 닫으면(Esc) onClose */
function Dialog({
  open,
  labelledBy,
  onClose,
  className,
  children,
}: {
  open: boolean;
  labelledBy: string;
  onClose: () => void;
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`holdings-dialog ${className}`}
      aria-labelledby={labelledBy}
      onClose={() => {
        if (open) onClose();
      }}
    >
      {open ? <div className="holdings-dialog-panel">{children}</div> : null}
    </dialog>
  );
}

/** 칸 고르기 창 */
export function SlotSheet({
  view,
  controller,
  names,
}: {
  view: UnitHoldings | null;
  controller: HoldingsController;
  names: RosterNames;
}) {
  const titleId = useId();
  const target = controller.sheet;
  const cell = view && target && target.unit === view.unit ? view.slots[target.index] : undefined;
  const busy = controller.pending !== null;
  const choices = view && cell ? slotChoices(view, cell) : [];
  return (
    <Dialog
      open={cell !== undefined}
      labelledBy={titleId}
      onClose={controller.closeSlot}
      className="holdings-sheet"
    >
      {cell ? (
        <>
          <div className="holdings-dialog-head">
            <h2 id={titleId} className="holdings-dialog-title">
              {m.holdings_slot_title({ slot: slotKindLabel(cell.kind, cell.ordinal) })}
            </h2>
            <button type="button" className="button-small" onClick={controller.closeSlot}>
              {m.holdings_close()}
            </button>
          </div>
          <NoticeLine notice={controller.notice} />
          <section className="holdings-dialog-section" aria-label={m.holdings_slot_current()}>
            <h3 className="holding-subtitle">{m.holdings_slot_current()}</h3>
            {cell.holding ? (
              <div className="holding-card holding-current" data-holding={cell.holding.id}>
                <HoldingTitle holding={cell.holding} />
                <StatChips holding={cell.holding} names={names} />
                <DurabilityLine holding={cell.holding} />
                <div className="holding-actions">
                  <button
                    type="button"
                    className="button-small"
                    aria-disabled={busy ? "true" : undefined}
                    onClick={() => {
                      if (!busy && cell.holding) controller.unequip(cell.holding);
                    }}
                  >
                    {m.holdings_action_unequip()}
                  </button>
                </div>
              </div>
            ) : (
              <p className="roster-empty holdings-dashed">{m.holdings_slot_empty()}</p>
            )}
          </section>
          <section
            className="holdings-dialog-section"
            aria-label={m.holdings_slot_choices({ count: formatNumber(choices.length) })}
          >
            <h3 className="holding-subtitle">
              {m.holdings_slot_choices({ count: formatNumber(choices.length) })}
            </h3>
            {choices.length === 0 ? (
              <p className="roster-empty">{m.holdings_slot_no_choices()}</p>
            ) : (
              <ul className="holding-choices">
                {choices.map((holding) => {
                  const broken = isBroken(holding);
                  return (
                    <li key={holding.id}>
                      <button
                        type="button"
                        className="holding-choice"
                        data-holding={holding.id}
                        aria-disabled={busy || broken ? "true" : undefined}
                        aria-label={m.holdings_action_label({
                          action: m.roster_action_equip(),
                          item: holdingName(holding),
                        })}
                        onClick={() => {
                          if (!busy && !broken) controller.equip(holding, cell.index);
                        }}
                      >
                        <HoldingTitle holding={holding} />
                        <StatChips holding={holding} names={names} />
                        <DurabilityLine holding={holding} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </Dialog>
  );
}

/** 효과 교체 확인 창(D-501) */
export function ReplaceDialog({
  view,
  controller,
}: {
  view: UnitHoldings | null;
  controller: HoldingsController;
}) {
  const titleId = useId();
  const request = controller.replace;
  const nameOf = (effect: string): string => {
    const active = view?.effects.find((entry) => entry.effect === effect);
    return localName(active?.name ?? undefined, effect);
  };
  return (
    <Dialog
      open={request !== null}
      labelledBy={titleId}
      onClose={controller.cancelReplace}
      className="holdings-confirm"
    >
      {request ? (
        <>
          <h2 id={titleId} className="holdings-dialog-title">
            {m.holdings_replace_title()}
          </h2>
          <p>{m.holdings_replace_body({ item: holdingName(request.holding) })}</p>
          <ul className="holding-lost">
            {request.effects.map((effect) => (
              <li key={effect} data-effect={effect}>
                {nameOf(effect)}
              </li>
            ))}
          </ul>
          <div className="form-actions">
            <button type="button" onClick={controller.cancelReplace}>
              {m.holdings_replace_cancel()}
            </button>
            <button type="button" className="button-primary" onClick={controller.confirmReplace}>
              {m.holdings_replace_confirm()}
            </button>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
