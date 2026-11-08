// 계산식 조각판 — 칸 변수·중간값·함수·연산자 칩(docs/adr/2026-11-01-formula-editor.md "바뀜 (2026-11-08 끌어 넣기)").
// 사용자 원문(2026-11-08): "STR 같은 명확한 상수는 드래그해서 쓸수있게 직관적으로 하면 오타없이 좋을듯".
// - 마우스(가는 포인터): 칩을 글 상자에 끌어 놓으면 놓은 자리에, 누르면 글자 위치에 넣는다. 휴대폰(손가락): 누르기만(끌기는 스크롤과 겹친다).
// - 칩마다 한 줄 풀이: [뜻 함께 보기]가 켜지면 칩 안에, 꺼지면 아래 도움 줄에 가리키거나 누른 칩의 풀이(읽는 프로그램은 늘 aria-describedby).
// - 키보드: 조각판은 Tab 한 번(도구 막대), 화살표·Home·End로 칩을 옮기고 Enter·Space로 넣는다(넣은 뒤 글 상자로 초점).
// 시험용: .fx-chip[data-kind][data-token], .fx-palette[data-detail].
import type { FormulaSlot } from "@terra/shared/formula";
import { type DragEvent, type KeyboardEvent, useId, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import {
  FORMULA_TOKEN_MIME,
  type PaletteKind,
  type PaletteToken,
  paletteOf,
  tokenLabel,
} from "./formulaInsert.ts";
import { tokenHint } from "./formulaMessages.ts";
import { useMediaQuery } from "./useMediaQuery.ts";
import "./formulaPalette.css";

interface Props {
  readonly slot: FormulaSlot;
  /** 지금 식 글(중간값 칩을 여기서 모은다) */
  readonly source: string;
  /** 끌기를 켤지(가는 포인터) */
  readonly drag: boolean;
  readonly onInsert: (token: PaletteToken) => void;
}

const GROUPS: readonly { kind: PaletteKind; name: () => string }[] = [
  { kind: "var", name: m.dev_formula_palette_vars },
  { kind: "local", name: m.dev_formula_palette_locals },
  { kind: "fn", name: m.dev_formula_palette_fns },
  { kind: "op", name: m.dev_formula_palette_ops },
];

/** 1차 스탯 칩은 묶음 색(--color-stat-*, data-field) */
const STAT_FIELDS: Readonly<Record<string, string>> = {
  STR: "str",
  DEX: "dex",
  AGI: "agi",
  VIT: "vit",
  INT: "int",
  WIS: "wis",
};

const tokenKey = (token: PaletteToken): string => `${token.kind}:${token.name}`;

export function FormulaPalette({ slot, source, drag, onInsert }: Props) {
  const baseId = useId();
  const wide = useMediaQuery("(min-width: 48em)");
  const [detailChoice, setDetailChoice] = useState<boolean | null>(null);
  const detail = detailChoice ?? wide;
  const [help, setHelp] = useState<PaletteToken | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const chips = useRef<(HTMLButtonElement | null)[]>([]);
  const tokens = paletteOf(slot, source);
  const current = Math.min(focusIndex, tokens.length - 1);
  const indexOf = new Map(tokens.map((token, index) => [tokenKey(token), index]));

  const move = (event: KeyboardEvent<HTMLDivElement>): void => {
    const last = tokens.length - 1;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? Math.min(last, current + 1)
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? Math.max(0, current - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setFocusIndex(next);
    chips.current[next]?.focus();
  };

  const startDrag = (event: DragEvent<HTMLButtonElement>, token: PaletteToken): void => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(FORMULA_TOKEN_MIME, JSON.stringify(token));
    // 다른 곳(메모장 등)에 놓으면 이름만
    event.dataTransfer.setData("text/plain", token.kind === "fn" ? `${token.name}(` : token.name);
    setHelp(token);
  };

  return (
    <section className="fx-palette" aria-labelledby={`${baseId}-title`} data-detail={detail ? "on" : "off"}>
      <div className="fx-palette-head">
        <h4 id={`${baseId}-title`} className="fx-palette-title">
          {m.dev_formula_palette_title()}
        </h4>
        <button
          type="button"
          className="button-small fx-palette-toggle"
          aria-pressed={detail}
          onClick={() => setDetailChoice(!detail)}
        >
          {m.dev_formula_palette_details()}
        </button>
      </div>
      <p id={`${baseId}-hint`} className="field-hint fx-palette-hint">
        {drag ? m.dev_formula_palette_hint_drag() : m.dev_formula_palette_hint_tap()}
      </p>
      <div
        role="toolbar"
        className="fx-palette-groups"
        aria-labelledby={`${baseId}-title`}
        aria-describedby={`${baseId}-hint`}
        onKeyDown={move}
        // 마우스가 떠나면 도움 줄을 비운다(손가락은 누른 칩의 풀이를 남긴다)
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setHelp(null);
        }}
      >
        {GROUPS.map((group) => {
          const items = tokens.filter((token) => token.kind === group.kind);
          if (items.length === 0) return null;
          return (
            <div
              key={group.kind}
              role="group"
              className="fx-palette-group"
              aria-labelledby={`${baseId}-${group.kind}`}
            >
              <span id={`${baseId}-${group.kind}`} className="fx-palette-group-name">
                {group.name()}
              </span>
              <div className="fx-chips">
                {items.map((token) => {
                  const index = indexOf.get(tokenKey(token)) ?? 0;
                  const hintId = `${baseId}-h${index}`;
                  return (
                    <button
                      key={tokenKey(token)}
                      ref={(element) => {
                        chips.current[index] = element;
                      }}
                      type="button"
                      className="fx-chip"
                      data-kind={token.kind}
                      data-token={token.name}
                      data-field={token.kind === "var" ? STAT_FIELDS[token.name] : undefined}
                      tabIndex={index === current ? 0 : -1}
                      draggable={drag}
                      aria-describedby={hintId}
                      onDragStart={drag ? (event) => startDrag(event, token) : undefined}
                      onFocus={() => {
                        setFocusIndex(index);
                        setHelp(token);
                      }}
                      onPointerEnter={(event) => {
                        if (event.pointerType === "mouse") setHelp(token);
                      }}
                      onClick={() => {
                        setHelp(token);
                        onInsert(token);
                      }}
                    >
                      <span className="fx-chip-name" translate="no">
                        {tokenLabel(token)}
                      </span>
                      <span id={hintId} className="fx-chip-hint" aria-hidden="true">
                        {tokenHint(token)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {detail ? null : (
        // 뜻을 숨긴 때: 가리키거나 누른 칩의 풀이(읽는 프로그램은 칩 설명으로 듣는다)
        <p className="fx-palette-help" aria-hidden="true">
          {help ? m.dev_formula_palette_help({ name: tokenLabel(help), hint: tokenHint(help) }) : " "}
        </p>
      )}
    </section>
  );
}
