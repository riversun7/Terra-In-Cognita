// 세력·우편 화면이 함께 쓰는 작은 부품 — 곧 열림 단추·칸, 시안 자료 표·스위치, 칸 머리, 조회 상태 줄.
// - 곧 열림 단추: 게임 상태를 바꾸는 명령(선전포고·투표·보내기 등)은 WebSocket으로만 보낸다(AGENTS 4장). 아직 명령이 없어
//   aria-disabled 단추로 둔다(초점은 남는다). 누르면 화면 아래 알림 영역이 "아무 명령도 보내지 않았다"를 읽는다(SoonProvider).
// - 시안 자료 스위치: 홈 [편집]과 같은 스위치 하나다(inbox/preview.ts). dev·admin에게만 그린다(서버가 요청마다 권한을 다시 본다).
import { type ReactNode, createContext, use, useCallback, useEffect, useId, useRef } from "react";
import { useSession } from "../auth/session.ts";
import { setPreviewOn, usePreviewOn } from "../inbox/preview.ts";
import { m } from "../paraglide/messages.js";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { StatusIcon } from "../ui/StatusIcon.tsx";
import { text } from "../ui/text.ts";
import type { PlainMessageKey } from "../ui/messageRef.ts";
import "./screenParts.css";

/** 곧 열림 알림을 지우는 시간 */
const SOON_NOTICE_MS = 4_000;

const SoonContext = createContext<() => void>(() => {
  // 공급자 밖(시험): 아무것도 하지 않는다
});

/** 곧 열림 단추를 누르면 읽을 알림 영역(화면 아래에 붙는다). 화면 하나에 하나 둔다 */
export function SoonProvider({ children }: { children: ReactNode }) {
  const live = useLiveLines();
  const { show, clear } = live;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announce = useCallback(() => {
    show([m.screen_soon_pressed()]);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(clear, SOON_NOTICE_MS);
  }, [show, clear]);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <SoonContext value={announce}>
      {children}
      <div className="soon-live">
        <LiveMessage tone="info" lines={live.lines} version={live.version} />
      </div>
    </SoonContext>
  );
}

/** "곧 열림" 작은 표 */
export function SoonTag() {
  return <span className="soon-tag">{m.screen_soon()}</span>;
}

/** 아직 명령이 없는 동작 단추(누르면 곧 열림 알림만) */
export function SoonButton({
  label,
  primary = false,
  context,
}: {
  label: string;
  primary?: boolean;
  /** 화면 읽기에만 앞에 붙는 대상 이름(목록 줄마다 같은 단추 글자일 때, 예: "동맹 조약" + "안건 올리기") */
  context?: string;
}) {
  const announce = use(SoonContext);
  return (
    <button
      type="button"
      className={primary ? "button-small soon-button soon-button-primary" : "button-small soon-button"}
      aria-disabled="true"
      onClick={announce}
    >
      {context === undefined ? null : <span className="visually-hidden">{`${context} `}</span>}
      <span>{label}</span>
      <SoonTag />
    </button>
  );
}

/** 단추 줄(넘치면 다음 줄) */
export function ActionRow({ children }: { children: ReactNode }) {
  return <div className="screen-actions">{children}</div>;
}

/** 아직 자료가 없는 칸 */
export function SoonPanel({ title }: { title?: string }) {
  return (
    <div className="soon-panel">
      <SoonTag />
      {title === undefined ? null : <p className="soon-panel-title">{title}</p>}
      <p className="soon-panel-body">{m.screen_soon_section()}</p>
    </div>
  );
}

/** "시험 자료" 표 */
export function PreviewTag() {
  return <span className="preview-tag">{m.inbox_preview_tag()}</span>;
}

/** 칸 머리: 제목(h2) + 시험 자료 표 + 끝에 둘 것 */
export function SectionHead({
  id,
  title,
  preview = false,
  end,
}: {
  id: string;
  title: string;
  preview?: boolean;
  end?: ReactNode;
}) {
  return (
    <div className="screen-section-head">
      <h2 id={id} className="screen-section-title">
        {title}
      </h2>
      {preview ? <PreviewTag /> : null}
      {end === undefined ? null : <div className="screen-section-end">{end}</div>}
    </div>
  );
}

/** 시안 자료 스위치(dev·admin만). 켜면 이 화면·홈·처리함이 함께 시안 자료를 묻는다 */
export function PreviewSwitch() {
  const session = useSession();
  const on = usePreviewOn();
  const nameId = useId();
  const hintId = useId();
  const roles = session.kind === "signed_in" ? session.user.roles : [];
  if (!roles.some((role) => role === "dev" || role === "admin")) return null;
  return (
    <label className="screen-switch">
      <span className="screen-switch-text">
        <span className="screen-switch-name" id={nameId}>
          {m.screen_preview_switch()}
        </span>
        <span className="screen-switch-hint" id={hintId}>
          {m.screen_preview_switch_hint()}
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="visually-hidden screen-switch-input"
        checked={on}
        onChange={(event) => setPreviewOn(event.target.checked)}
        aria-labelledby={nameId}
        aria-describedby={hintId}
      />
      <span className="screen-switch-track" aria-hidden="true" />
    </label>
  );
}

/** 시안 자료 안내 줄 */
export function PreviewNotice({ message }: { message: string }) {
  return (
    <p className="preview-notice">
      <StatusIcon tone="info" />
      <span>{message}</span>
    </p>
  );
}

/** 조회 실패 안내 + [다시 시도]. 실패가 아니면 빈 알림 영역만(영역은 늘 둔다) */
export function QueryFailure({
  error,
  title,
  onRetry,
}: {
  error: PlainMessageKey | null;
  title: string;
  onRetry: () => void;
}) {
  return (
    <>
      <LiveMessage tone="error" lines={error === null ? [] : [title, text({ key: error })]} />
      {error === null ? null : (
        <div className="form-actions">
          <button type="button" onClick={onRetry}>
            {m.retry()}
          </button>
        </div>
      )}
    </>
  );
}

export interface TabSpec<T extends string> {
  readonly id: T;
  readonly name: string;
  /** 이름 옆 수(없으면 그리지 않는다) */
  readonly count?: number | null;
}

/** 탭 id·패널 id(aria-controls·aria-labelledby로 잇는다) */
export const tabId = (prefix: string, id: string): string => `${prefix}-tab-${id}`;
export const panelId = (prefix: string, id: string): string => `${prefix}-panel-${id}`;

/**
 * 탭 줄(WAI-ARIA 탭: 화살표·Home·End로 옮기면 바로 고른다). 고른 탭만 Tab 키로 들어온다.
 * 좁으면 가로로 넘긴다(.screen-tabs)
 */
export function TabList<T extends string>({
  label,
  prefix,
  tabs,
  selected,
  onSelect,
  formatCount,
}: {
  label: string;
  prefix: string;
  tabs: readonly TabSpec<T>[];
  selected: T;
  onSelect: (id: T) => void;
  formatCount: (value: number) => string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const move = (index: number): void => {
    const count = tabs.length;
    const next = tabs[((index % count) + count) % count];
    if (next === undefined) return;
    onSelect(next.id);
    listRef.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(tabId(prefix, next.id))}`)?.focus();
  };
  return (
    <div className="screen-tabs" role="tablist" aria-label={label} ref={listRef}>
      {tabs.map((tab, index) => {
        const active = tab.id === selected;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={tabId(prefix, tab.id)}
            className="screen-tab"
            aria-selected={active}
            aria-controls={panelId(prefix, tab.id)}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => {
              const keys: Record<string, number> = {
                ArrowRight: index + 1,
                ArrowLeft: index - 1,
                Home: 0,
                End: tabs.length - 1,
              };
              const target = keys[event.key];
              if (target === undefined) return;
              event.preventDefault();
              move(target);
            }}
          >
            <span>{tab.name}</span>
            {tab.count === undefined || tab.count === null ? null : (
              <span className="screen-tab-count">{formatCount(tab.count)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** 상태 표(색 + 글자). tone: good·warn·bad·plain */
export function StateChip({ tone, label }: { tone: "good" | "warn" | "bad" | "plain"; label: string }) {
  return (
    <span className="state-chip" data-tone={tone}>
      {label}
    </span>
  );
}

/** 이름·값 한 쌍(dl 안에 둔다) */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <dt className="fact-label">{label}</dt>
      <dd className="fact-value">{children}</dd>
    </div>
  );
}
