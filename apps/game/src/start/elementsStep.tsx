// 첫 접속 4단계 — 속성 분배(기획 D-450, 49 N36): 기본 4원소(물·불·바람·땅) 가운데 두 칸까지 골라 10점을 나눈다(한 칸에 모두 넣어도 된다).
// docs/adr/2026-11-01-first-login-cyborg.md "바뀜 (D-450~D-453)".
// - 칸 수·점수는 서버가 보낸 규칙(cyborg.creation rules.elementCells·elementPoints, 팩 tuning N36)이고, 판정은 서버가 같은 함수
//   (@terra/shared checkElementAllocation)로 다시 한다. 화면은 같은 함수로 [다음]을 열고 닫는다.
// - 속성은 양날의 검(D-182): 고른 속성 공격이 세지고 상성 속성에 약해진다. 빛·어둠은 종교 환생, 강화형은 장비·인공장기·신앙에서 온다.
// - ElementsOnly: 분배가 없는 옛 사이보그(프로토콜 5 전에 만든 것)가 /start에 오면 이 단계만 보이고 cyborg_elements로 한 번 나눈다.
// 스타일은 elements.css(start.css와 나눠 둔다).
import type { AccountView } from "@terra/shared";
import {
  BASIC_ELEMENTS,
  type CyborgCreationResponse,
  ELEMENT_MAX,
  type ElementAllocationRule,
  checkElementAllocation,
} from "@terra/shared/cyborg";
import { useId, useState } from "react";
import { m } from "../paraglide/messages.js";
import { formatNumber } from "../roster/rosterText.ts";
import { navigate } from "../shell/routerStore.ts";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { ElementIcon } from "../ui/elementIcons.tsx";
import { markCyborgElementsSet } from "./cyborgGate.ts";
import { sendCyborgCommand } from "./cyborgCommands.ts";
import { commandErrorText } from "./startText.ts";
import "./elements.css";

export type BasicElement = (typeof BASIC_ELEMENTS)[number];
/** 고르는 중인 분배(4원소만, 0인 칸은 고르지 않은 칸) */
export type ElementDraft = Readonly<Record<BasicElement, number>>;

export const EMPTY_ELEMENT_DRAFT: ElementDraft = { water: 0, fire: 0, wind: 0, earth: 0 };

const ELEMENT_NAMES = {
  water: m.start_element_water,
  fire: m.start_element_fire,
  wind: m.start_element_wind,
  earth: m.start_element_earth,
} satisfies Record<BasicElement, () => string>;

export const elementText = (element: BasicElement): string => ELEMENT_NAMES[element]();

export function ruleOf(data: CyborgCreationResponse): ElementAllocationRule {
  return { cells: data.rules.elementCells, points: data.rules.elementPoints };
}

/** 서버에 보낼 모양(0인 칸은 빼고) */
export function elementPayload(draft: ElementDraft): Partial<Record<BasicElement, number>> {
  return Object.fromEntries(
    BASIC_ELEMENTS.flatMap((element) => (draft[element] > 0 ? [[element, draft[element]]] : [])),
  );
}

export function elementDraftValid(draft: ElementDraft, rule: ElementAllocationRule): boolean {
  return checkElementAllocation(elementPayload(draft), rule).ok;
}

/** 고른 칸 수·남은 점수 */
function draftCounts(draft: ElementDraft, rule: ElementAllocationRule) {
  let used = 0;
  let cells = 0;
  for (const element of BASIC_ELEMENTS) {
    used += draft[element];
    if (draft[element] > 0) cells += 1;
  }
  return { left: rule.points - used, cells };
}

export function ElementsStep({
  draft,
  rule,
  onDraft,
  disabled = false,
}: {
  draft: ElementDraft;
  rule: ElementAllocationRule;
  onDraft: (next: ElementDraft) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const { left, cells } = draftCounts(draft, rule);
  const cellsFull = cells >= rule.cells;
  const cap = Math.min(ELEMENT_MAX, rule.points);

  const set = (element: BasicElement, value: number): void => {
    onDraft({ ...draft, [element]: Math.max(0, Math.min(cap, value)) });
  };
  /** 이 칸에 더할 수 있는가: 남은 점수가 있고, 새 칸이면 고를 칸이 남았다 */
  const canAdd = (element: BasicElement): boolean =>
    !disabled && left > 0 && draft[element] < cap && (draft[element] > 0 || !cellsFull);
  /** 이 칸에 모두: 다른 칸을 비우고 이 칸에 점수를 다 넣는다(한 칸에 몰기, D-450 원문) */
  const putAll = (element: BasicElement): void => {
    onDraft({ ...EMPTY_ELEMENT_DRAFT, [element]: cap });
  };

  return (
    <div className="start-elements">
      <p className="start-hint">
        {m.start_elements_intro({ cells: formatNumber(rule.cells), points: formatNumber(rule.points) })}
      </p>
      <fieldset className="start-group" aria-describedby={`${id}-status`}>
        <legend className="start-group-title">{m.start_elements_pick()}</legend>
        {BASIC_ELEMENTS.map((element) => {
          const value = draft[element];
          return (
            <div
              key={element}
              className="start-element"
              data-element={element}
              data-picked={value > 0 ? "true" : "false"}
            >
              <span className="start-element-head">
                <ElementIcon code={element} className="start-element-icon" />
                <span className="start-element-name" id={`${id}-${element}`}>
                  {elementText(element)}
                </span>
              </span>
              <button
                type="button"
                className="button-small start-element-step start-element-less"
                aria-label={m.start_elements_less({ element: elementText(element) })}
                onClick={() => set(element, value - 1)}
                disabled={disabled || value <= 0}
              >
                −
              </button>
              <span className="start-element-value" aria-labelledby={`${id}-${element}`} aria-live="polite">
                {formatNumber(value)}
              </span>
              <button
                type="button"
                className="button-small start-element-step start-element-more"
                aria-label={m.start_elements_more({ element: elementText(element) })}
                onClick={() => set(element, value + 1)}
                disabled={!canAdd(element)}
              >
                +
              </button>
              <button
                type="button"
                className="button-small start-element-all"
                aria-label={m.start_elements_all_label({
                  element: elementText(element),
                  points: formatNumber(cap),
                })}
                onClick={() => putAll(element)}
                disabled={disabled || value === cap}
              >
                {m.start_elements_all()}
              </button>
              <span className="start-element-bar" aria-hidden="true">
                <span
                  className="start-element-fill"
                  style={{ inlineSize: `${Math.round((value / ELEMENT_MAX) * 100)}%` }}
                />
              </span>
            </div>
          );
        })}
      </fieldset>
      <p className="start-elements-status" id={`${id}-status`} aria-live="polite">
        <span data-left={left}>{m.start_elements_left({ left: formatNumber(left) })}</span>
        <span>{m.start_elements_cells({ count: formatNumber(cells), max: formatNumber(rule.cells) })}</span>
      </p>
      {cellsFull && left > 0 ? (
        <p className="start-hint">{m.start_elements_cells_full({ max: formatNumber(rule.cells) })}</p>
      ) : left > 0 ? (
        <p className="start-hint">{m.start_elements_need({ points: formatNumber(rule.points) })}</p>
      ) : null}
      <p className="start-hint">{m.start_elements_edge()}</p>
      <p className="start-hint">{m.start_elements_later()}</p>
    </div>
  );
}

/** 강하 요약의 한 줄(DescentStep 사실 목록 안): 속성별 아이콘과 색상 칩 목록 */
export function ElementsSummaryRow({ draft }: { draft: ElementDraft }) {
  const picked = BASIC_ELEMENTS.flatMap((element) =>
    draft[element] > 0 ? [{ element, value: draft[element] }] : [],
  );
  return (
    <div className="start-elements-summary">
      <dt>{m.start_step_elements()}</dt>
      <dd>
        {picked.length === 0 ? (
          <span className="start-summary-empty">—</span>
        ) : (
          <ul className="start-summary-elements">
            {picked.map(({ element, value }, index) => (
              <li key={element} className="start-summary-element-chip" data-element={element}>
                <ElementIcon code={element} className="start-summary-element-icon" />
                <span className="start-summary-element-name">{elementText(element)}</span>{" "}
                <span className="start-summary-element-value">{formatNumber(value)}</span>
                {index < picked.length - 1 ? <span className="visually-hidden"> · </span> : null}
              </li>
            ))}
          </ul>
        )}
      </dd>
    </div>
  );
}

/** 분배가 없는 옛 사이보그: 이 단계만 보이고 한 번 나눈다(cyborg_elements, 프로토콜 5) */
export function ElementsOnly({ user, data }: { user: AccountView; data: CyborgCreationResponse }) {
  const rule = ruleOf(data);
  const [draft, setDraft] = useState<ElementDraft>(EMPTY_ELEMENT_DRAFT);
  const [saving, setSaving] = useState(false);
  const problem = useLiveLines();
  const valid = elementDraftValid(draft, rule);

  const save = async (): Promise<void> => {
    if (saving || !valid) return;
    setSaving(true);
    problem.clear();
    const result = await sendCyborgCommand({ t: "cyborg_elements", elements: elementPayload(draft) });
    if (result.ok || result.code === "elements_locked") {
      // 나눴다(또는 다른 기기에서 이미 나눴다): 길잡이를 풀고 홈으로
      markCyborgElementsSet(user.id);
      navigate({ route: "home" }, { replace: true });
      return;
    }
    setSaving(false);
    problem.show([commandErrorText(result.code)]);
  };

  return (
    <div className="start-panel panel start-elements-only">
      <h2 className="start-step-title">{m.start_elements_only_title()}</h2>
      <p className="start-hint">{m.start_elements_only_body()}</p>
      <ElementsStep draft={draft} rule={rule} onDraft={setDraft} disabled={saving} />
      <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
      <div className="start-nav">
        <button
          type="button"
          className="button-primary"
          onClick={() => void save()}
          aria-disabled={saving || !valid}
          disabled={!valid}
        >
          {saving ? m.start_elements_saving() : m.start_elements_save()}
        </button>
      </div>
    </div>
  );
}
