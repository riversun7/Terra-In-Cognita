// 계산식 입력 칸 — 고정폭 글 상자 + 이름 자동 완성 + 오류 위치 표시(docs/adr/2026-11-01-formula-editor.md "화면").
// 오타 막기(사용자 결정 D-488): 입력하는 낱말로 시작하는 변수·중간값·함수 이름을 목록으로 보이고(↑↓ 고르기, Enter·Tab 넣기, Esc 닫기),
// 모르는 이름·문법 오류는 글 안 위치에 표시를 달아 아래에 다시 보인다. 판정은 서버가 저장 때 같은 해석기로 한 번 더 본다.
import { type FormulaIssue, type FormulaSlotView, isFormulaFunction } from "@terra/shared/formula";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { type Suggestion, applySuggestion, lineColumn, suggestionsFor, wordAt } from "./formulaModel.ts";
import { functionText, issueText, varText } from "./formulaMessages.ts";

interface Props {
  readonly id: string;
  readonly slot: FormulaSlotView;
  readonly value: string;
  readonly issues: readonly FormulaIssue[];
  readonly onChange: (value: string) => void;
}

/** 오류 범위에 표시를 단 글 조각들(겹치면 앞 오류만) */
function marked(source: string, issues: readonly FormulaIssue[]): { text: string; mark: boolean }[] {
  const ranges = issues
    .map((issue) => ({
      s: Math.min(issue.s, source.length),
      e: Math.min(Math.max(issue.e, issue.s + 1), source.length + 1),
    }))
    .toSorted((a, b) => a.s - b.s);
  const parts: { text: string; mark: boolean }[] = [];
  let at = 0;
  for (const range of ranges) {
    if (range.s < at) continue;
    if (range.s > at) parts.push({ text: source.slice(at, range.s), mark: false });
    // 끝에서 난 오류(덜 끝난 식)는 빈칸 하나에 표시
    parts.push({ text: source.slice(range.s, range.e) || " ", mark: true });
    at = range.e;
  }
  if (at < source.length) parts.push({ text: source.slice(at), mark: false });
  return parts;
}

export function FormulaEditor({ id, slot, value, issues, onChange }: Props) {
  const listId = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(value.length);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const { prefix } = wordAt(value, caret);
  const suggestions = open ? suggestionsFor(slot, value, prefix) : [];
  const shown = suggestions.length > 0;
  const activeIndex = Math.min(active, Math.max(0, suggestions.length - 1));

  const accept = (suggestion: Suggestion): void => {
    const next = applySuggestion(value, caret, suggestion);
    onChange(next.source);
    setCaret(next.caret);
    setOpen(false);
    // 글자 위치를 넣은 이름 뒤로(그리기 뒤)
    requestAnimationFrame(() => {
      area.current?.setSelectionRange(next.caret, next.caret);
      area.current?.focus();
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (!shown) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      const pick = suggestions[activeIndex];
      if (pick) {
        event.preventDefault();
        accept(pick);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  const errors = issues.filter((issue) => issue.code !== "unused_local");
  return (
    <div className="fx-editor">
      <textarea
        id={id}
        ref={area}
        className="input fx-input"
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        rows={Math.min(10, Math.max(3, value.split("\n").length + 1))}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown ? `${listId}-${activeIndex}` : undefined}
        aria-invalid={errors.length > 0 || undefined}
        onChange={(event) => {
          onChange(event.target.value);
          setCaret(event.target.selectionStart);
          setOpen(true);
          setActive(0);
        }}
        onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      <ul
        id={listId}
        className="fx-suggest"
        role="listbox"
        aria-label={m.dev_formula_suggestions()}
        hidden={!shown}
      >
        {suggestions.map((suggestion, index) => (
          <li
            key={suggestion.name}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            data-kind={suggestion.kind}
            // 누르기 전에 글 상자가 초점을 잃어 목록이 닫히지 않게
            onMouseDown={(event) => {
              event.preventDefault();
              accept(suggestion);
            }}
          >
            <span className="fx-suggest-name" translate="no">
              {suggestion.kind === "fn" ? `${suggestion.name}()` : suggestion.name}
            </span>
            <span className="fx-suggest-hint">
              {isFormulaFunction(suggestion.name)
                ? functionText(suggestion.name)
                : suggestion.kind === "var"
                  ? varText(suggestion.name)
                  : m.dev_formula_locals()}
            </span>
          </li>
        ))}
      </ul>
      {errors.length > 0 ? (
        <>
          <pre className="fx-mirror" aria-hidden="true" translate="no">
            {marked(value, errors).map((part, index) =>
              part.mark ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>,
            )}
          </pre>
          <ul className="fx-issues" role="alert">
            {errors.map((issue, index) => {
              const at = lineColumn(value, issue.s);
              return (
                <li key={`${issue.code}-${issue.s}-${index}`} data-code={issue.code}>
                  <span className="fx-issue-at">
                    {m.dev_formula_at({ line: at.line, column: at.column })}
                  </span>{" "}
                  {issueText(issue)}
                  {issue.suggestion ? (
                    <button
                      type="button"
                      className="button-small fx-fix"
                      onClick={() =>
                        onChange(value.slice(0, issue.s) + (issue.suggestion ?? "") + value.slice(issue.e))
                      }
                    >
                      {m.dev_formula_fix({ name: issue.suggestion })}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
