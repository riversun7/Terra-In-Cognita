// 복귀 요약 대화상자 — 없는 동안 일어난 일(생산·습격과 방어·부상·세계 소식)을 칸마다 수로 보인다(D-6014·D-266).
// 지연 로딩 조각(default export). ReturnSummary.tsx가 보일 요약이 있을 때만 불러 그린다. ADR 2026-10-29-app-shell 2·8절
// - <dialog>.showModal()로 연다(초점을 가두고, 닫으면 연 자리로 돌려준다). 좁으면 화면 전체, 넓으면 가운데 판.
// - 기록 칸을 쌓지 않는다. [확인]·Esc(브라우저 닫기 요청)로 닫는다. 닫으면 보던 화면에 남는다(D-266).
// - 숫자를 누르면 그 화면으로 가고 확인한 것으로 친다(닫는다). 갈 화면이 없는 칸(세계 소식 등)은 수만 보인다.
// - 모르는 칸 종류(더 새 서버)는 그리지 않는다. 시안 자료 칸에는 "시험 자료"를 붙인다.
import { isRouteTarget, targetPath } from "@terra/shared";
import type { SummaryGetResponse, SummarySection, SummarySectionKind } from "@terra/shared/inbox";
import { type MouseEvent, useEffect, useId, useRef } from "react";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { formatWait } from "../ui/messageRef.ts";
import "./summary.css";

/** 칸 종류 → 이름. 칸 종류가 늘면 satisfies가 빠진 이름을 알려 준다 */
const SECTION_LABELS = {
  production: m.summary_section_production,
  raid: m.summary_section_raid,
  injury: m.summary_section_injury,
  world_news: m.summary_section_world_news,
} satisfies Record<SummarySectionKind, () => string>;

function isKnownSection(kind: string): kind is SummarySectionKind {
  return Object.hasOwn(SECTION_LABELS, kind);
}

/** 그릴 칸: 아는 종류이고 사건이 있는 칸 */
function visibleSections(summary: SummaryGetResponse): (SummarySection & { kind: SummarySectionKind })[] {
  const result: (SummarySection & { kind: SummarySectionKind })[] = [];
  for (const section of summary.sections) {
    const { kind } = section;
    if (isKnownSection(kind) && section.count > 0) result.push({ ...section, kind });
  }
  return result;
}

/** 칸을 누르면 갈 주소. 이 기기가 아는 화면이 아니면 null */
function sectionHref(section: SummarySection): string | null {
  const target: unknown = section.target;
  return isRouteTarget(target) ? targetPath(target) : null;
}

export interface SummaryDialogProps {
  readonly summary: SummaryGetResponse;
  readonly navigate: ((path: string) => void) | undefined;
  /** 대화상자가 닫혔다([확인]·Esc·숫자 눌러 이동) */
  readonly onClose: () => void;
}

export default function SummaryDialog({ summary, navigate, onClose }: SummaryDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const locale = getLocale();
  const count = new Intl.NumberFormat(locale);
  const sections = visibleSections(summary);
  const period =
    summary.since === null
      ? null
      : m.summary_period({ duration: formatWait((summary.until - summary.since) / 1_000, locale) });
  const anyLink = sections.some((section) => sectionHref(section) !== null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // 읽기 프로그램이 제목부터 읽게 한다(첫 링크로 바로 가지 않게)
    headingRef.current?.focus();
  }, []);

  const close = (): void => {
    dialogRef.current?.close();
  };

  const follow = (event: MouseEvent<HTMLAnchorElement>, path: string): void => {
    if (!navigate || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    close();
    navigate(path);
  };

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
            const href = sectionHref(section);
            const body = (
              <>
                <span className="summary-count">{count.format(section.count)}</span>
                <span className="summary-label">{SECTION_LABELS[section.kind]()}</span>
                {section.preview === true ? (
                  <span className="summary-tag">{m.inbox_preview_tag()}</span>
                ) : null}
              </>
            );
            return (
              <li key={section.kind}>
                {href === null ? (
                  <div className="summary-row">{body}</div>
                ) : (
                  <a
                    className="summary-row summary-link"
                    href={href}
                    onClick={(event) => follow(event, href)}
                  >
                    {body}
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
