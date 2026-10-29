// 홈 편집 시트 — 지연 로딩되는 따로 된 조각. [편집]을 누르면 <dialog>.showModal()로 연다(초점이 시트 안에 갇힌다, ADR 2026-10-29-app-shell 2·6·10절).
// - 카드 더하기·빼기, ↑·↓·맨 위로, 크기 고르기, 손잡이로 끌어 옮기기(보조). 템플릿 칸·시안 자료 켜기는 dev·admin만(사용자 결정 2).
//   시안 자료 스위치는 처리함·종 배지·복귀 요약과 같은 하나다(inboxParts.ts setPreviewOn, W3 inbox/preview.ts).
// - 바꿀 때마다 바로 저장한다(homeSettings.ts의 patchHome). 그래서 닫기·Esc·뒤로로 닫아도 잃는 것이 없다. 되돌리기는 [카드 기본값으로].
// - 알림 영역(polite)이 결과를 읽는다("7개 중 3번째로 옮겼습니다"). 옮긴 뒤에도 누른 단추에 초점이 남는다(줄이 DOM에서 옮겨져도).
// - 머리 카드(조합의 처리할 일 등)는 "맨 위 고정"으로만 보인다. 처리할 일 카드는 뺄 수 없다(homeView.ts isRemovable).
// - 이 기기가 모르는 카드(더 새 버전)는 보이지 않지만 제자리에 남는다(reorder.ts).
// - 닫으면 연 단추로 초점을 돌려준다(HomeScreen). 열림과 기록 칸(뒤로 → 닫힘)은 HomeScreen이 화면 틀(W1)의 겹침 칸으로 정한다(shellParts.tsx
//   useSheetOverlay). 뒤로로 닫히면 이 부품이 화면에서 내려간다(<dialog>가 DOM에서 빠지며 닫힌다).
import type { Role } from "@terra/shared";
import {
  type CardId,
  type CardSize,
  HOME_CARDS,
  HOME_CARDS_MAX,
  HOME_TEMPLATES,
  type HomeCardEntry,
  type HomeTemplate,
  isCardId,
} from "@terra/shared/dashboard";
import { type MouseEvent, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { cardTitle } from "../cards/registry.tsx";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CARD_ICONS,
  CloseIcon,
  GripIcon,
  PlusIcon,
  RemoveIcon,
  ToTopIcon,
} from "../cards/icons.tsx";
import { patchHome } from "../homeSettings.ts";
import { canUseHomeTools, heroCards, isRemovable, listedIn } from "../homeView.ts";
import { setPreviewOn } from "../inboxParts.ts";
import { templateName } from "../templateText.ts";
import {
  type ListChange,
  type MoveTarget,
  addCard,
  addableCards,
  moveCard,
  removeCard,
  resetCards,
  resizeCard,
} from "./reorder.ts";
import { useReorder } from "./useReorder.ts";
import "./editSheet.css";

export interface EditSheetProps {
  /** 지금 그리는 템플릿(머리 카드·편집 목록 규칙) */
  readonly template: HomeTemplate;
  /** 저장된 템플릿(템플릿 칸의 고른 표시) */
  readonly savedTemplate: HomeTemplate;
  /** 주소 ?template=으로 보고 있다(저장값보다 먼저 보인다) */
  readonly templateFromAddress: boolean;
  /** parseHome 결과(모르는 카드 포함, 저장 순서) */
  readonly cards: readonly HomeCardEntry[];
  readonly roles: readonly Role[];
  readonly preview: boolean;
  readonly onClose: () => void;
}

/** 크기 글자("2×1")와 읽기 프로그램용 이름("가로 2칸, 세로 1칸") */
function sizeParts(size: CardSize): { w: string; h: string } {
  const [w = "1", h = "1"] = size.split("x");
  return { w, h };
}

/** 단추를 누른 뒤 다시 초점을 둘 곳 */
type FocusControl = "top" | "up" | "down" | "remove";

interface FocusRequest {
  readonly id: string;
  readonly control: FocusControl;
}

function SizePicker({
  id,
  name,
  current,
  onPick,
}: {
  id: CardId;
  name: string;
  current: string;
  onPick: (size: CardSize) => void;
}) {
  const sizes: readonly CardSize[] = HOME_CARDS[id].sizes;
  if (sizes.length === 1) {
    const only = sizes[0] ?? HOME_CARDS[id].defaultSize;
    return (
      <span className="sheet-size-fixed">
        <span aria-hidden="true">{m.home_size(sizeParts(only))}</span>
        <span className="visually-hidden">
          {m.home_edit_resized({ name, size: m.home_size_label(sizeParts(only)) })}
        </span>
      </span>
    );
  }
  return (
    <fieldset className="sheet-sizes">
      <legend className="visually-hidden">{m.home_edit_size({ name })}</legend>
      {sizes.map((size) => (
        <label key={size} className="sheet-size">
          <input
            type="radio"
            className="visually-hidden sheet-size-input"
            name={`home-size-${id}`}
            value={size}
            checked={current === size}
            onChange={() => onPick(size)}
            aria-label={m.home_size_label(sizeParts(size))}
          />
          <span className="sheet-size-face" aria-hidden="true">
            {m.home_size(sizeParts(size))}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export default function EditSheet({
  template,
  savedTemplate,
  templateFromAddress,
  cards,
  roles,
  preview,
  onClose,
}: EditSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const noteId = useId();
  const previewNameId = useId();
  const previewHintId = useId();
  const tools = canUseHomeTools(roles);
  const listed = useMemo(() => listedIn(template), [template]);
  const rows = cards.filter(listed);
  const pinned = heroCards(template);
  // 이 템플릿의 머리 카드는 위에 늘 보이므로 더하기 목록에서 뺀다(더해도 격자에 보이지 않는다)
  const addable = addableCards(cards).filter((id) => !pinned.includes(id));
  const full = addable.length > 0 && cards.length >= HOME_CARDS_MAX;
  const [announcement, setAnnouncement] = useState({ text: "", version: 0 });
  const focusRequest = useRef<FocusRequest | null>(null);
  /** 빼기·기본값으로 되돌리기 바로 앞의 카드 목록([실행 취소]). 다른 것을 바꾸면 지운다 */
  const [undo, setUndo] = useState<readonly HomeCardEntry[] | null>(null);

  const announce = (text: string): void => {
    setAnnouncement((previous) => ({ text, version: previous.version + 1 }));
  };

  // 처음 그려지면 모달로 연다(초점이 시트 안에 갇힌다). 화면에서 내려가면 DOM에서 빠지며 저절로 닫힌다
  // (여기서 close()를 부르지 않는다: 개발 모드의 효과 두 번 돌리기에서 close 알림이 늦게 와 시트가 바로 닫힌다)
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);

  // 옮긴 줄이 DOM에서 자리를 바꿔 초점을 잃었으면 같은 단추로 돌려준다
  useLayoutEffect(() => {
    const request = focusRequest.current;
    const list = listRef.current;
    if (request === null || list === null) return;
    focusRequest.current = null;
    const target = list.querySelector<HTMLElement>(
      `[data-reorder-id="${request.id}"] [data-control="${request.control}"]`,
    );
    if (target !== null && document.activeElement !== target) target.focus();
  });

  /** 바뀐 목록을 바로 저장하고 결과를 읽어 준다. undoable이면 [실행 취소]로 앞 목록을 되살릴 수 있다 */
  const commit = (
    change: ListChange | null,
    message: (change: ListChange) => string,
    undoable = false,
  ): boolean => {
    if (change === null) return false;
    if (change.cards !== cards) patchHome({ cards: change.cards });
    setUndo(undoable && change.cards !== cards ? cards : null);
    announce(message(change));
    return true;
  };

  const undoLast = (): void => {
    if (undo === null) return;
    patchHome({ cards: undo });
    setUndo(null);
    announce(m.home_edit_undone());
    // 누른 단추가 사라지므로 시트 제목으로 초점을 옮긴다(시트 밖으로 빠지지 않게)
    titleRef.current?.focus();
  };

  const move = (id: CardId, target: MoveTarget, control?: FocusControl): void => {
    const done = commit(moveCard(cards, listed, id, target), (change) =>
      m.home_edit_moved({ position: change.position, total: change.total }),
    );
    if (done && control !== undefined) focusRequest.current = { id, control };
  };

  const { draggingId, handleProps, cancelDrag } = useReorder({
    listRef,
    scrollerRef: bodyRef,
    onDrop: (id, to) => {
      if (isCardId(id)) move(id, to);
    },
  });

  const remove = (id: CardId, index: number): void => {
    const name = cardTitle(id);
    const done = commit(removeCard(cards, listed, id), () => m.home_edit_removed({ name }), true);
    if (!done) return;
    // 빠진 줄 대신 다음 줄(없으면 앞 줄)의 빼기 단추로 초점을 옮긴다
    const next = rows[index + 1] ?? rows[index - 1];
    if (next !== undefined) focusRequest.current = { id: next.id, control: "remove" };
  };

  const add = (id: CardId): void => {
    const name = cardTitle(id);
    const done = commit(addCard(cards, listed, id), (change) =>
      m.home_edit_added({ name, position: change.position, total: change.total }),
    );
    // 더한 카드는 목록 끝에 생긴다. 그 줄의 "위로"에 초점을 두어 바로 자리를 옮길 수 있게 한다
    if (done) focusRequest.current = { id, control: "up" };
  };

  const resize = (id: CardId, size: CardSize): void => {
    const name = cardTitle(id);
    commit(resizeCard(cards, listed, id, size), () =>
      m.home_edit_resized({ name, size: m.home_size_label(sizeParts(size)) }),
    );
  };

  const reset = (): void => {
    commit(resetCards(cards, listed, roles), () => m.home_edit_reset_done(), true);
  };

  const pickTemplate = (next: HomeTemplate): void => {
    if (next === savedTemplate) return;
    patchHome({ template: next });
    setUndo(null);
    announce(m.home_edit_template_done({ name: templateName(next) }));
  };

  const close = (): void => {
    dialogRef.current?.close();
  };

  // 시트 밖(어두운 바탕)을 누르면 닫는다
  const onDialogClick = (event: MouseEvent<HTMLDialogElement>): void => {
    if (event.target === event.currentTarget) close();
  };

  // 바탕 누름(onDialogClick)은 마우스·터치 편의다. 키보드는 Esc·[닫기]로 닫는다
  return (
    <dialog
      ref={dialogRef}
      className="home-sheet"
      aria-labelledby={titleId}
      aria-describedby={noteId}
      onClose={onClose}
      onCancel={(event) => {
        // 끄는 중의 Esc는 끌기만 되돌린다(시트는 열린 채)
        if (cancelDrag()) event.preventDefault();
      }}
      onClick={onDialogClick}
    >
      <div className="home-sheet-head">
        <h2 id={titleId} className="home-sheet-title" ref={titleRef} tabIndex={-1}>
          {m.home_edit_title()}
        </h2>
        {/* 빼기·되돌리기 뒤에만 보인다. 몸이 넘어가도 머리는 그대로라 늘 보인다 */}
        {undo === null ? null : (
          <button type="button" className="button-small" onClick={undoLast}>
            {m.home_edit_undo()}
          </button>
        )}
        <button type="button" className="sheet-icon-button" onClick={close}>
          <CloseIcon />
          <span className="visually-hidden">{m.home_edit_close()}</span>
        </button>
      </div>
      <div className="home-sheet-body" ref={bodyRef}>
        <p id={noteId} className="sheet-hint">
          {m.home_edit_saved_note()}
        </p>

        {tools ? (
          <fieldset className="sheet-section">
            <legend className="sheet-section-title">{m.home_edit_template()}</legend>
            {templateFromAddress ? <p className="sheet-hint">{m.home_edit_template_url()}</p> : null}
            <div className="sheet-templates">
              {HOME_TEMPLATES.map((option) => (
                <label key={option} className="sheet-choice">
                  <input
                    type="radio"
                    className="visually-hidden sheet-choice-input"
                    name="home-template"
                    value={option}
                    checked={savedTemplate === option}
                    onChange={() => pickTemplate(option)}
                  />
                  <span className="sheet-choice-face">
                    <span>{templateName(option)}</span>
                    <span className="sheet-radio-mark" aria-hidden="true" />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {tools ? (
          <label className="sheet-switch-row">
            <span className="sheet-switch-text">
              <span className="sheet-switch-name" id={previewNameId}>
                {m.home_edit_preview()}
              </span>
              <span className="sheet-hint" id={previewHintId}>
                {m.home_edit_preview_hint()}
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="visually-hidden sheet-switch-input"
              checked={preview}
              onChange={(event) => setPreviewOn(event.target.checked)}
              aria-labelledby={previewNameId}
              aria-describedby={previewHintId}
            />
            <span className="sheet-switch-track" aria-hidden="true" />
          </label>
        ) : null}

        <section className="sheet-section" aria-labelledby={`${titleId}-cards`}>
          <h3 id={`${titleId}-cards`} className="sheet-section-title">
            {m.home_edit_cards()}
          </h3>
          {pinned.length > 0 ? (
            <ul className="sheet-pinned-list">
              {pinned.map((id) => {
                const Icon = CARD_ICONS[id];
                return (
                  <li key={id} className="sheet-pinned">
                    <span className="home-card-icon" data-card-icon={id}>
                      <Icon />
                    </span>
                    <span className="sheet-name">{cardTitle(id)}</span>
                    <span className="sheet-tag">{m.home_edit_pinned()}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <ol className="sheet-list" ref={listRef} data-dragging={draggingId === null ? undefined : "true"}>
            {rows.map((entry, index) => {
              if (!isCardId(entry.id)) return null;
              const id = entry.id;
              const name = cardTitle(id);
              const Icon = CARD_ICONS[id];
              const first = index === 0;
              const last = index === rows.length - 1;
              return (
                <li
                  key={id}
                  className="sheet-row"
                  data-reorder-id={id}
                  data-dragging={draggingId === id ? "true" : undefined}
                >
                  <span className="sheet-handle" aria-hidden="true" {...handleProps(id)}>
                    <GripIcon />
                  </span>
                  <span className="sheet-name">
                    <span className="home-card-icon" data-card-icon={id}>
                      <Icon />
                    </span>
                    <span>{name}</span>
                  </span>
                  {isRemovable(id) ? (
                    <button
                      type="button"
                      className="sheet-icon-button sheet-remove"
                      data-control="remove"
                      onClick={() => remove(id, index)}
                    >
                      <RemoveIcon />
                      <span className="visually-hidden">{m.home_edit_remove({ name })}</span>
                    </button>
                  ) : null}
                  <div className="sheet-controls">
                    <SizePicker
                      id={id}
                      name={name}
                      current={entry.size}
                      onPick={(size) => resize(id, size)}
                    />
                    <span className="sheet-move">
                      <button
                        type="button"
                        className="sheet-icon-button"
                        data-control="top"
                        aria-disabled={first}
                        onClick={() => (first ? undefined : move(id, "top", "top"))}
                      >
                        <ToTopIcon />
                        <span className="visually-hidden">{m.home_edit_top({ name })}</span>
                      </button>
                      <button
                        type="button"
                        className="sheet-icon-button"
                        data-control="up"
                        aria-disabled={first}
                        onClick={() => (first ? undefined : move(id, "up", "up"))}
                      >
                        <ArrowUpIcon />
                        <span className="visually-hidden">{m.home_edit_up({ name })}</span>
                      </button>
                      <button
                        type="button"
                        className="sheet-icon-button"
                        data-control="down"
                        aria-disabled={last}
                        onClick={() => (last ? undefined : move(id, "down", "down"))}
                      >
                        <ArrowDownIcon />
                        <span className="visually-hidden">{m.home_edit_down({ name })}</span>
                      </button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="sheet-section" aria-labelledby={`${titleId}-add`}>
          <h3 id={`${titleId}-add`} className="sheet-section-title">
            {m.home_edit_add_title()}
          </h3>
          {addable.length === 0 ? <p className="sheet-hint">{m.home_edit_add_none()}</p> : null}
          {full ? <p className="sheet-hint">{m.home_edit_full()}</p> : null}
          {addable.length > 0 ? (
            <ul className="sheet-add-list">
              {addable.map((id) => {
                const Icon = CARD_ICONS[id];
                const name = cardTitle(id);
                return (
                  <li key={id} className="sheet-add">
                    <span className="sheet-name">
                      <span className="home-card-icon" data-card-icon={id}>
                        <Icon />
                      </span>
                      <span>{name}</span>
                    </span>
                    <button
                      type="button"
                      className="button-small"
                      aria-disabled={full}
                      onClick={() => (full ? undefined : add(id))}
                    >
                      <PlusIcon />
                      <span aria-hidden="true">{m.home_edit_add()}</span>
                      <span className="visually-hidden">{m.home_edit_add_named({ name })}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

        <div className="form-actions sheet-actions">
          <button type="button" onClick={reset}>
            {m.home_edit_reset()}
          </button>
          <button type="button" className="button-primary" onClick={close}>
            {m.home_edit_close()}
          </button>
        </div>
      </div>
      <p className="visually-hidden" role="status">
        <span key={announcement.version}>{announcement.text}</span>
      </p>
    </dialog>
  );
}
