// 복귀 요약 대화상자 — 없는 동안 일어난 일(생산·습격과 방어·부상·세계 소식)을 칸마다 수로 보인다(D-6014·D-266).
// 지연 로딩 조각(default export). ReturnSummary.tsx가 보일 요약이 있을 때만 불러 그린다. ADR 2026-10-29-app-shell 2·8절
// - <dialog>.showModal()로 연다(초점을 가두고, 닫으면 연 자리로 돌려준다). 좁으면 화면 전체, 넓으면 가운데 판.
// - 기록 칸을 쌓지 않는다. [확인]·Esc(브라우저 닫기 요청)로 닫는다. 닫으면 보던 화면에 남는다(D-266).
// - 숫자를 누르면 그 화면으로 가고 확인한 것으로 친다(닫는다). 갈 화면이 없는 칸(세계 소식 등)은 수만 보인다.
// - 모르는 칸 종류(더 새 서버)는 그리지 않는다. 그릴 칸이 하나도 없으면 열지 않고 바로 닫힌 것으로 알린다.
//   시안 자료 칸에는 "시험 자료"를 붙인다.
import { type RouteTarget, isRouteTarget, targetPath } from "@terra/shared";
import type { SummaryGetResponse, SummarySection } from "@terra/shared/inbox";
import { type MouseEvent, useEffect, useId, useRef } from "react";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { SECTION_LABELS, formatSpan, visibleSections } from "./summaryText.ts";
import "./summary.css";

/** 칸을 누르면 갈 화면. 이 기기가 아는 화면이 아니면 null */
function sectionTarget(section: SummarySection): RouteTarget | null {
  const target: unknown = section.target;
  return isRouteTarget(target) ? target : null;
}

/** 누르면 그 화면으로 간다는 표시(꾸밈) */
function Chevron() {
  return (
    <svg
      className="summary-chevron"
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m7.5 4.5 5.5 5.5-5.5 5.5" />
    </svg>
  );
}

export interface SummaryDialogProps {
  readonly summary: SummaryGetResponse;
  /** 앱 안 이동(ReturnSummary.tsx). 없으면 보통 링크다 */
  readonly onNavigate: ((target: RouteTarget) => void) | undefined;
  /** 대화상자가 닫혔다([확인]·Esc·숫자 눌러 이동) */
  readonly onClose: () => void;
}

export default function SummaryDialog({ summary, onNavigate, onClose }: SummaryDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const locale = getLocale();
  const count = new Intl.NumberFormat(locale);
  const sections = visibleSections(summary);
  const nothing = sections.length === 0;
  const period =
    summary.since === null
      ? null
      : m.summary_period({ duration: formatSpan(summary.until - summary.since, locale) });
  const anyLink = sections.some((section) => sectionTarget(section) !== null);

  useEffect(() => {
    // 보일 칸이 없다(모르는 칸 종류뿐): 열지 않는다
    if (nothing) {
      onClose();
      return;
    }
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // 읽기 프로그램이 제목부터 읽게 한다(첫 링크로 바로 가지 않게)
    headingRef.current?.focus();
  }, [nothing, onClose]);

  const close = (): void => {
    dialogRef.current?.close();
  };

  // 보통 왼쪽 누름만 앱 안 이동으로 바꾼다(보조 키·가운데 버튼은 브라우저에 맡긴다). 요약을 먼저 닫는다(기록 칸이 없으니 이동이 쌓기다)
  const follow = (event: MouseEvent<HTMLAnchorElement>, target: RouteTarget): void => {
    if (!onNavigate || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    close();
    onNavigate(target);
  };

  if (nothing) return null;
  return (
    <dialog ref={dialogRef} className="summary-dialog" aria-labelledby={titleId} onClose={onClose}>
      <div className="summary-panel">
        <div className="summary-head">
          <h2 id={titleId} ref={headingRef} className="summary-title" tabIndex={-1}>
            {m.summary_title()}
          </h2>
          {period !== null ? <p className="lead">{period}</p> : null}
        </div>
        <ul className="summary-sections">
          {sections.map((section) => {
            const target = sectionTarget(section);
            const body = (
              <>
                <span className="summary-count">{count.format(section.count)}</span>
                <span className="summary-text">
                  <span className="summary-label">{SECTION_LABELS[section.kind]()}</span>
                  {section.preview === true ? (
                    <span className="summary-tag">{m.inbox_preview_tag()}</span>
                  ) : null}
                </span>
              </>
            );
            return (
              <li key={section.kind}>
                {target === null ? (
                  <div className="summary-row">{body}</div>
                ) : (
                  <a
                    className="summary-row summary-link"
                    href={targetPath(target)}
                    onClick={(event) => follow(event, target)}
                  >
                    {body}
                    <Chevron />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
        {anyLink ? <p className="summary-hint">{m.summary_hint()}</p> : null}
        <div className="form-actions">
          <button type="button" className="button-primary" onClick={close}>
            {m.summary_confirm()}
          </button>
        </div>
      </div>
    </dialog>
  );
}
