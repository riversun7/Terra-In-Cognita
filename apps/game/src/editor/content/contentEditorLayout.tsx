// 콘텐츠 편집기 화면 틀 부품(아이템·스킬·건물 편집기 공용) — docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-08 화면 개편)".
// 설정 칸 패널(/dev/tuning)과 한 가족으로 보이게: 머리 요약 칩 + 도구, 탭 줄(←→), 편집 판 머리(이름·ID·표지·이전/다음·동작, 붙음),
// 구역(제목·쉬운 풀이·출처·담은 칸 수·팩과 다른 칸 수, 접힘), 구역 바로 가기, 키 안내, 내보내기 판, 묻는 줄, 화면 키 훅.
// 배치(넓은 폭 = 왼쪽 목록 + 오른쪽 편집 판, 휴대폰 = 한 칸씩)는 contentEditorShell.css의 @container ce-screen.
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import type { TuningExportResponse } from "@terra/shared/tuning";
import { m } from "../../paraglide/messages.js";
import { useSectionCounts } from "./contentEditorCompare.tsx";
import "./contentEditorShell.css";

/** 머리 요약 칩 하나 */
export interface SummaryChip {
  readonly key: string;
  readonly text: string;
  /** 경고색(바뀐 것이 있음) */
  readonly warn?: boolean | undefined;
  readonly className?: string | undefined;
  /** 시험용 data-count */
  readonly count?: number | undefined;
}

/** 머리: 요약 칩(팩 판·덮어쓰기 판·수·바뀐 수) + 오른쪽 도구(내보내기·최근 바꿈) */
export function EditorSummary({
  label,
  chips,
  tools,
  className,
}: {
  label: string;
  chips: readonly SummaryChip[];
  tools?: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className="ce-head">
      <ul className={`ce-summary ${className ?? ""}`} aria-label={label}>
        {chips.map((chip) => (
          <li
            key={chip.key}
            className={chip.className}
            data-warn={chip.warn ? "" : undefined}
            data-count={chip.count}
          >
            {chip.text}
          </li>
        ))}
      </ul>
      {tools ? (
        <div className="ce-tools" role="group" aria-label={m.dev_content_tools_label()}>
          {tools}
        </div>
      ) : null}
    </div>
  );
}

/** 탭 줄(role tablist, ←→·Home·End로 옮기며 고른다). 탭마다 담은 수 표지 */
export function EditorTabs<T extends string>({
  id,
  label,
  tabs,
  selected,
  onSelect,
  className,
}: {
  id: string;
  label: string;
  tabs: readonly { readonly value: T; readonly label: string; readonly staged?: number | undefined }[];
  selected: T;
  onSelect: (tab: T) => void;
  /** 탭 단추 클래스(시험) */
  className?: string | undefined;
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>());
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const count = tabs.length;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % count
        : event.key === "ArrowLeft"
          ? (index - 1 + count) % count
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : null;
    const tab = next === null ? undefined : tabs[next];
    if (!tab) return;
    event.preventDefault();
    onSelect(tab.value);
    refs.current.get(tab.value)?.focus();
  };
  return (
    <div className="ce-tabs" role="tablist" aria-label={label} id={id}>
      {tabs.map((tab, index) => (
        <button
          key={tab.value}
          ref={(element) => {
            if (element) refs.current.set(tab.value, element);
            else refs.current.delete(tab.value);
          }}
          type="button"
          role="tab"
          id={`${id}-${tab.value}`}
          aria-selected={selected === tab.value}
          aria-controls={`${id}-${tab.value}-panel`}
          tabIndex={selected === tab.value ? 0 : -1}
          className={`ce-tab ${className ?? ""}`}
          onClick={() => onSelect(tab.value)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          <span>{tab.label}</span>
          {tab.staged ? (
            <span
              className="ce-badge ce-badge-staged"
              title={m.dev_content_pending_count({ count: tab.staged })}
            >
              {tab.staged}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** 편집 판 머리(넓은 폭은 위 띠 아래에 붙음): [← 목록](휴대폰) · 이름·ID · 표지 · [‹ 이전]·[다음 ›] · 동작 */
export function EntryHead({
  name,
  id,
  badges,
  actions,
  info,
  onBack,
  onPrev,
  onNext,
  backClass,
  headingId,
}: {
  name: string;
  id: string;
  badges?: ReactNode;
  actions?: ReactNode;
  /** 머리 아래 작은 글(덮어쓴 사람·쓰는 곳) */
  info?: ReactNode;
  onBack: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  /** [← 목록] 단추 클래스(시험) */
  backClass: string;
  headingId: string;
}) {
  return (
    <header className="ce-entry-head">
      <div className="ce-entry-head-row">
        <button type="button" className={`ce-back-list ${backClass}`} onClick={onBack}>
          {m.dev_content_back_list()}
        </button>
        <h2 id={headingId} className="ce-entry-heading">
          <span className="ce-entry-heading-name">{name}</span>{" "}
          <code className="ce-entry-id" translate="no">
            {id}
          </code>
        </h2>
        <span className="ce-step">
          <button
            type="button"
            className="ce-icon-button"
            aria-label={m.dev_content_prev()}
            aria-keyshortcuts="Alt+ArrowUp"
            title={`${m.dev_content_prev()} (Alt+↑)`}
            aria-disabled={onPrev === null}
            onClick={onPrev ?? undefined}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            className="ce-icon-button"
            aria-label={m.dev_content_next()}
            aria-keyshortcuts="Alt+ArrowDown"
            title={`${m.dev_content_next()} (Alt+↓)`}
            aria-disabled={onNext === null}
            onClick={onNext ?? undefined}
          >
            <span aria-hidden="true">›</span>
          </button>
        </span>
      </div>
      {badges ? <div className="ce-entry-head-badges">{badges}</div> : null}
      {info ? <div className="ce-entry-head-info">{info}</div> : null}
      {actions ? (
        <div className="ce-entry-actions" role="group" aria-label={name}>
          {actions}
        </div>
      ) : null}
    </header>
  );
}

/** 표지 하나(담음·덮어씀·새로 만듦·꺼짐·권고·보통) */
export function Badge({
  tone,
  children,
  className,
}: {
  tone: "staged" | "changed" | "created" | "off" | "advice" | "plain";
  children: ReactNode;
  className?: string | undefined;
}) {
  return <span className={`ce-badge ce-badge-${tone} ${className ?? ""}`}>{children}</span>;
}

/**
 * 편집 구역: 제목 · 담은 칸 수 · 팩과 다른 칸 수(paths 앞머리 안) · 쉬운 풀이 · 출처. 접힌다(details). name = data-section(시험),
 * id = 바로 가기 대상
 */
export function FormSection({
  title,
  desc,
  source,
  paths,
  name,
  open = true,
  className,
  children,
}: {
  title: string;
  desc?: string | undefined;
  /** 근거(기획 코드·결정 번호) */
  source?: string | undefined;
  /** 이 구역의 칸 경로 앞머리(담은 칸·팩과 다른 칸 세기) */
  paths?: readonly string[] | undefined;
  name: string;
  open?: boolean;
  className?: string | undefined;
  children: ReactNode;
}) {
  const counts = useSectionCounts(paths);
  return (
    <details
      className={`ce-form-section ${className ?? ""}`}
      open={open}
      data-section={name}
      id={`ce-section-${name}`}
      data-staged={counts.staged > 0 ? "" : undefined}
    >
      <summary className="ce-form-section-head">
        <span className="ce-form-section-title">{title}</span>
        {counts.staged > 0 ? (
          <span className="ce-badge ce-badge-staged">
            {m.dev_content_section_staged({ count: counts.staged })}
          </span>
        ) : null}
        {counts.changed > 0 ? (
          <span className="ce-badge ce-badge-changed">
            {m.dev_content_section_changed({ count: counts.changed })}
          </span>
        ) : null}
      </summary>
      <div className="ce-form-section-body">
        {desc || source ? (
          <p className="ce-form-section-desc">
            {desc}
            {source ? <span className="ce-source"> {m.dev_content_source({ source })}</span> : null}
          </p>
        ) : null}
        {children}
      </div>
    </details>
  );
}

/** 구역 바로 가기(편집 판 머리 아래): 누르면 그 구역을 펼치고 그리로 옮긴다 */
export function SectionJump({
  sections,
}: {
  sections: readonly { readonly name: string; readonly label: string }[];
}) {
  if (sections.length < 3) return null;
  return (
    <nav className="ce-jump" aria-label={m.dev_content_jump_label()}>
      {sections.map((section) => (
        <button
          key={section.name}
          type="button"
          className="ce-jump-link"
          onClick={() => {
            const target = document.getElementById(`ce-section-${section.name}`);
            if (target instanceof HTMLDetailsElement) target.open = true;
            target?.scrollIntoView({ block: "start" });
            target?.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
          }}
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}

/** 키 안내(넓은 폭 목록 아래) */
export function KeyHelp() {
  const keys: readonly { readonly keys: readonly string[]; readonly text: string }[] = [
    { keys: ["/"], text: m.dev_content_key_search() },
    { keys: ["↑", "↓"], text: m.dev_content_key_list() },
    { keys: ["Alt", "↑↓"], text: m.dev_content_key_step() },
    { keys: ["Ctrl", "S"], text: m.dev_content_key_save() },
  ];
  return (
    <dl className="ce-keys" aria-label={m.dev_content_keys_label()}>
      {keys.map((row) => (
        <div key={row.text}>
          <dt>
            {row.keys.map((key, index) => (
              <span key={key}>
                {index > 0 ? "+" : null}
                <kbd>{key}</kbd>
              </span>
            ))}
          </dt>
          <dd>{row.text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 팩 차이 내보내기 판(tuning.export — 설정 칸·편집기 차이를 함께 든 파일, `pnpm tuning:apply`) */
export function ExportPanel({
  exported,
  onClose,
  textClass,
}: {
  exported: TuningExportResponse;
  onClose: () => void;
  /** 글 칸 클래스(시험) */
  textClass: string;
}) {
  const titleId = useId();
  const text = `${JSON.stringify(exported.diff, null, 2)}\n`;
  const download = (): void => {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = exported.fileName;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="ce-panel ce-export" aria-labelledby={titleId}>
      <h2 id={titleId} className="ce-panel-title">
        {m.dev_content_export_title()}
      </h2>
      <p className="field-hint">{m.dev_content_export_hint()}</p>
      <textarea
        className={`input ce-export-text ${textClass}`}
        readOnly
        rows={6}
        value={text}
        aria-labelledby={titleId}
      />
      <div className="ce-inline-actions">
        <button type="button" className="button-primary" onClick={download}>
          {m.dev_content_export_download()}
        </button>
        <button type="button" onClick={onClose}>
          {m.dev_content_close()}
        </button>
      </div>
    </section>
  );
}

/** 묻는 줄(지우기·팩 값으로 등): 글 + [예]·[아니요] */
export function ConfirmLine({
  text,
  onYes,
  onNo,
  className,
  yesClass,
}: {
  text: string;
  onYes: () => void;
  onNo: () => void;
  className?: string | undefined;
  yesClass?: string | undefined;
}) {
  const textId = useId();
  return (
    <div className={`ce-confirm ${className ?? ""}`} role="alertdialog" aria-labelledby={textId}>
      <p id={textId}>{text}</p>
      <div className="ce-inline-actions">
        <button type="button" className={`button-primary ${yesClass ?? ""}`} onClick={onYes}>
          {m.dev_content_confirm_yes()}
        </button>
        <button type="button" onClick={onNo}>
          {m.dev_content_confirm_no()}
        </button>
      </div>
    </div>
  );
}

/** 글을 쓰는 칸(찾기 "/" 키를 가로채지 않을 곳) */
const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * 화면 키: "/" 찾기, Ctrl/⌘+S 적용(입력 칸에 친 글자가 먼저 들도록 칸을 떠난 뒤 다음 그림에서), Alt+↑/↓ 이전·다음 항목.
 * 담은 변경이 있으면 창 닫기·새로 고침 전에 브라우저가 묻는다(beforeunload).
 * 듣는 함수는 한 번만 달고 마지막으로 그린 동작을 부른다. 열린 창(dialog)이 있으면 쉰다
 */
export function useEditorKeys({
  searchRef,
  onSave,
  onStep,
  dirty,
}: {
  searchRef: RefObject<HTMLInputElement | null>;
  onSave: () => void;
  onStep: (step: -1 | 1) => void;
  /** 아직 보내지 않은 담은 변경이 있다: 창을 닫거나 새로 고칠 때 브라우저가 묻는다 */
  dirty: boolean;
}): void {
  const latest = useRef({ onSave, onStep });
  useLayoutEffect(() => {
    latest.current = { onSave, onStep };
  });
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (document.querySelector("dialog[open]")) return;
      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !isTypingTarget(event.target)
      ) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key.toLowerCase() === "s" && (event.ctrlKey || event.metaKey) && !event.altKey) {
        event.preventDefault();
        const active = document.activeElement;
        if (active instanceof HTMLElement && isTypingTarget(active)) active.blur();
        requestAnimationFrame(() => latest.current.onSave());
        return;
      }
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        (event.key === "ArrowUp" || event.key === "ArrowDown")
      ) {
        event.preventDefault();
        latest.current.onStep(event.key === "ArrowUp" ? -1 : 1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [searchRef]);
  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent): void => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);
}
