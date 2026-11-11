// 생산 편집기 탭 줄 — 옛 생산 편집기처럼 묶음마다 한 줄(필드채집 · 건물생산 · 2차가공 · 공용), 탭마다 아이콘·이름·수(사다리 아이템·레시피·구간).
// role tablist 하나에 묶음(role group)이 든다. ←→·Home·End로 탭을 옮기며 고른다(묶음을 넘어간다). 담은 변경이 있는 탭은 표지.
import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { m } from "../../paraglide/messages.js";

export interface ProductionTabItem {
  /** 주소 값(?tab=)이자 탭 열쇠 */
  readonly key: string;
  readonly label: string;
  readonly icon: ReactNode;
  /** 옆에 보일 수(없으면 숨김) */
  readonly count?: number | undefined;
  /** 담은 변경 수 */
  readonly staged?: number | undefined;
}

export interface ProductionTabGroup {
  readonly id: string;
  readonly label: string;
  readonly tabs: readonly ProductionTabItem[];
}

export function ProductionTabs({
  id,
  groups,
  selected,
  onSelect,
}: {
  id: string;
  groups: readonly ProductionTabGroup[];
  selected: string;
  onSelect: (key: string) => void;
}) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const order = groups.flatMap((group) => group.tabs.map((tab) => tab.key));
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, key: string): void => {
    const index = order.indexOf(key);
    const count = order.length;
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
    const target = next === null ? undefined : order[next];
    if (target === undefined) return;
    event.preventDefault();
    onSelect(target);
    refs.current.get(target)?.focus();
  };
  return (
    <div className="pd-tabs" role="tablist" aria-label={m.dev_prod_tabs_label()} id={id}>
      {groups.map((group) =>
        group.tabs.length === 0 ? null : (
          <div
            key={group.id}
            className="pd-tab-group"
            role="group"
            aria-label={group.label}
            data-group={group.id}
          >
            <span className="pd-tab-group-label" aria-hidden="true">
              {group.label}
            </span>
            <div className="pd-tab-row">
              {group.tabs.map((tab) => (
                <button
                  key={tab.key}
                  ref={(element) => {
                    if (element) refs.current.set(tab.key, element);
                    else refs.current.delete(tab.key);
                  }}
                  type="button"
                  role="tab"
                  id={`${id}-${tab.key}`}
                  aria-selected={selected === tab.key}
                  aria-controls={`${id}-panel`}
                  tabIndex={selected === tab.key ? 0 : -1}
                  className="pd-tab"
                  data-tab={tab.key}
                  onClick={() => onSelect(tab.key)}
                  onKeyDown={(event) => onKeyDown(event, tab.key)}
                >
                  {tab.icon}
                  <span className="pd-tab-name">{tab.label}</span>
                  {tab.count === undefined ? null : (
                    <span className="pd-tab-count" data-count={tab.count}>
                      {tab.count}
                    </span>
                  )}
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
          </div>
        ),
      )}
    </div>
  );
}
