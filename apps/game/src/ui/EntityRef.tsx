// 전역 고유명사(엔티티) 표기·클릭 팝업 컴포넌트 — 국가·도시·가문·캐릭터/유닛·건물.
// 사용자 결정(2026-11-25):
// - 고유명사는 종류별 전용 심볼 아이콘(또는 실제 국기/문장) + 고유 색 + 굵은 글자로 구분한다(안 B).
// - 클릭 가능한 고유명사는 점선 밑줄·호버 강조로 구분하고, 누르면 세부 팝업(EntityPopup) 또는 지정된 동작(예: 지분 탭 이동)을 실행한다.
import type { NationEmblemView } from "@terra/shared/nationEditor";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { m } from "../paraglide/messages.js";
import { NationEmblem } from "./NationEmblem.tsx";
import "./entityRef.css";

export type EntityKind = "nation" | "city" | "house" | "unit" | "building";
export type UnitSymbolRole = "cyborg" | "leader" | "mayor" | "human" | "android" | "creature" | "unit";

export interface EntityFactRow {
  readonly label: string;
  readonly value: string;
}

export interface EntityPopupDetail {
  readonly kind: EntityKind;
  readonly role?: UnitSymbolRole | undefined;
  readonly title: string;
  readonly kindLabel: string;
  readonly subtitle?: string | undefined;
  readonly emblem?: NationEmblemView | null | undefined;
  readonly facts?: readonly EntityFactRow[] | undefined;
  readonly action?: { readonly label: string; readonly onClick: () => void } | undefined;
}

/** 종류·역할별 전용 16px 심볼 아이콘(안 B — 초경량 인라인 SVG) */
export function EntitySymbol({
  kind,
  role,
  emblem,
  size = 16,
}: {
  readonly kind: EntityKind;
  readonly role?: UnitSymbolRole | undefined;
  readonly emblem?: NationEmblemView | null | undefined;
  readonly size?: number;
}) {
  if ((kind === "nation" || kind === "house") && emblem) {
    return (
      <span className="entity-ref-emblem" aria-hidden="true">
        <NationEmblem spec={emblem.spec} color={emblem.color} uploaded={emblem.uploaded} size={size} />
      </span>
    );
  }
  let paths: ReactNode;
  if (kind === "nation") {
    paths = (
      <>
        <path d="M5 20V4" />
        <path d="M5 5h12l-2.5 4 2.5 4H5" />
      </>
    );
  } else if (kind === "city") {
    paths = (
      <>
        <path d="M3 20h18" />
        <path d="M5 20V9l4-3 4 3v11" />
        <path d="M13 20v-7h6v7" />
        <path d="M8.5 13h1M8.5 16h1M15.5 16h1" />
      </>
    );
  } else if (kind === "house") {
    paths = (
      <>
        <path d="M12 3.5 19 6v5.5c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6z" />
        <path d="M12 7.5v8M8.5 11.5h7" />
      </>
    );
  } else if (kind === "building") {
    paths = (
      <>
        <path d="M4 20h16" />
        <path d="M6 20V7l6-3 6 3v13" />
        <path d="M10 20v-4h4v4M9.5 11h1M13.5 11h1" />
      </>
    );
  } else {
    // unit / character by role
    switch (role) {
      case "leader":
        paths = <path d="M3.5 17.5h17l1-9.5-5 3.8L12 5l-4.5 6.8-5-3.8z" />;
        break;
      case "mayor":
        paths = (
          <>
            <path d="M4 19h16" />
            <path d="M5 9h14l-7-4.5z" />
            <path d="M7.5 9v10M12 9v10M16.5 9v10" />
          </>
        );
        break;
      case "cyborg":
        paths = (
          <>
            <rect x="5" y="6.5" width="14" height="11.5" rx="3.5" />
            <path d="M12 3.5v3" />
            <path d="M8.5 11.5h7" />
            <path d="M9.5 15h5" />
          </>
        );
        break;
      case "android":
        paths = (
          <>
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 4.5v2.2M12 17.3v2.2M4.5 12h2.2M17.3 12h2.2M6.7 6.7l1.6 1.6M15.7 15.7l1.6 1.6M17.3 6.7l-1.6 1.6M8.3 15.7l-1.6 1.6" />
          </>
        );
        break;
      case "creature":
        paths = (
          <>
            <path d="M6.5 18.5c1-5 3.5-9.5 7-13" />
            <path d="M11 19c1-4 3-7.5 6.5-10.5" />
            <path d="M15.5 18.5c.8-2.5 2-4.8 4-6.8" />
          </>
        );
        break;
      default:
        paths = (
          <>
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5.5 19.5c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
          </>
        );
        break;
    }
  }
  return (
    <svg
      className="entity-ref-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths}
    </svg>
  );
}

/** 고유명사 클릭 시 열리는 경량 세부 정보 팝업(HTML top-layer dialog) */
export function EntityPopup({
  detail,
  onClose,
}: {
  readonly detail: EntityPopupDetail;
  readonly onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    titleRef.current?.focus();
  }, []);

  const close = (): void => ref.current?.close();

  return (
    <dialog
      ref={ref}
      className="entity-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) close();
      }}
      data-part="entity-popup"
      data-kind={detail.kind}
    >
      <div className="entity-dialog-body">
        <div className="entity-dialog-head">
          <div className="entity-dialog-title-wrap">
            <p className="entity-dialog-kicker">{detail.kindLabel}</p>
            <h3
              id={titleId}
              ref={titleRef}
              className="entity-dialog-title entity-ref"
              data-kind={detail.kind}
              data-role={detail.role}
              tabIndex={-1}
            >
              <EntitySymbol kind={detail.kind} role={detail.role} emblem={detail.emblem} size={20} />
              <span className="entity-ref-name" translate="no">
                {detail.title}
              </span>
            </h3>
            {detail.subtitle ? <p className="entity-dialog-sub">{detail.subtitle}</p> : null}
          </div>
          <button type="button" className="button-small" onClick={close}>
            {m.entity_popup_close()}
          </button>
        </div>
        {detail.facts && detail.facts.length > 0 ? (
          <dl className="entity-dialog-facts">
            {detail.facts.map((fact) => (
              <div key={fact.label} className="entity-dialog-fact">
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {detail.action ? (
          <div className="entity-dialog-actions">
            <button
              type="button"
              className="button-small button-primary"
              onClick={() => {
                close();
                detail.action?.onClick();
              }}
            >
              {detail.action.label}
            </button>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}

export interface EntityRefProps {
  readonly kind: EntityKind;
  readonly role?: UnitSymbolRole | undefined;
  readonly name: string;
  readonly emblem?: NationEmblemView | null | undefined;
  /** 내 유닛/내 가문 등 강조 */
  readonly mine?: boolean | undefined;
  /** 이름 뒤에 작게 붙이는 수치·지분율 등(예: "62%", "Lv.1") */
  readonly suffix?: string | undefined;
  /** 고유명사 번역 방지 여부(기본 true) */
  readonly noTranslate?: boolean | undefined;
  /** 직접 클릭 동작(예: 지분 탭 이동). popup과 둘 다 있으면 onClick 우선 */
  readonly onClick?: (() => void) | undefined;
  /** 클릭 시 띄울 세부 팝업 자료 */
  readonly popup?: EntityPopupDetail | undefined;
  readonly title?: string | undefined;
  readonly className?: string | undefined;
}

/**
 * 전역 고유명사 인라인 참조.
 * - onClick 또는 popup이 있으면 클릭 가능한 버튼 양식으로 렌더링한다.
 * - popup이 주어지면 클릭 시 최상위 레이어 팝업(EntityPopup)을 연다.
 */
export function EntityRef({
  kind,
  role,
  name,
  emblem,
  mine,
  suffix,
  noTranslate = true,
  onClick,
  popup,
  title,
  className,
}: EntityRefProps) {
  const [open, setOpen] = useState(false);
  const interactive = onClick !== undefined || popup !== undefined;
  const content = (
    <>
      <EntitySymbol kind={kind} role={role} emblem={emblem} />
      <span className="entity-ref-name" translate={noTranslate ? "no" : undefined}>
        {name}
      </span>
      {suffix ? <span className="entity-ref-suffix">{suffix}</span> : null}
    </>
  );

  if (!interactive) {
    return (
      <span
        className={className ? `entity-ref ${className}` : "entity-ref"}
        data-kind={kind}
        data-role={role}
        data-mine={mine ? "true" : undefined}
        title={title}
      >
        {content}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className={className ? `entity-ref entity-ref-btn ${className}` : "entity-ref entity-ref-btn"}
        data-kind={kind}
        data-role={role}
        data-mine={mine ? "true" : undefined}
        aria-haspopup={popup && !onClick ? "dialog" : undefined}
        title={title}
        onClick={() => {
          if (onClick) onClick();
          else if (popup) setOpen(true);
        }}
      >
        {content}
      </button>
      {open && popup ? <EntityPopup detail={popup} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
