// 분포 조작(합이 정해진 묶음: 확률·가중치 ‰) — docs/adr/2026-11-10-editor-input-controls.md.
// - 쌓은 가로 막대: 칸 사이 경계를 끌면 왼 칸이 늘고 오른 칸이 준다(0이 되면 다음 칸을 민다). 합은 늘 그대로다.
// - 칸마다 한 줄: 막대(0 ~ 합) · 값 칸(− / +, ↑↓ = 1, Shift = 10) · 백분율 · 잠금. 한 칸을 바꾸면 차이를 잠그지 않은 나머지에
//   지금 몫대로 나눈다(contentEditorNumeric.redistribute). 끌거나 치는 동안에는 시작할 때의 묶음에서 다시 셈한다(반올림이 쌓이지 않게).
// - 단추: 균등 · 정규화(합 맞춤) · 팩 값으로 · 잠금 모두 풀기. onChange는 늘 합이 total인 정수 배열만 낸다([적용]이 산수로 막히지 않는다).
// - 끄는 동안 값은 화면에 바로 보이고 바깥에는 80ms 간격으로 알린다(useDragCommit). renderReadout은 끄는 값으로 다시 그린다.
// 경계 손잡이는 포인터용이라 탭 차례 밖이다(키보드는 값 칸의 ↑↓). 값은 정수(‰)만 든다.
import { type PointerEvent as ReactPointerEvent, type ReactNode, useId, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { NumberControl, SliderTrack, useDragCommit } from "./contentEditorNumber.tsx";
import {
  type SliderRange,
  equalize,
  moveBoundary,
  normalizeParts,
  redistribute,
} from "./contentEditorNumeric.ts";
import "./contentEditorInputs.css";

export interface DistributionPart {
  readonly key: string;
  /** 짧은 이름(T3 등) */
  readonly label: string;
  /** 색 차례(0~9) */
  readonly tone?: number | undefined;
  /** 흐리게(권장 밖 칸) */
  readonly dim?: boolean | undefined;
}

const sumOf = (values: readonly number[]): number => values.reduce((acc, value) => acc + value, 0);
const sameValues = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/** 몫 글(백분율, 소수 한 자리, 그 언어의 자리 나눔) */
export function shareLabel(value: number, total: number): string {
  return new Intl.NumberFormat(getLocale(), {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(total > 0 ? value / total : 0);
}

/** 막대 칸에 이름을 적을 만큼 넓은 몫(‰ 단위가 아니라 합의 몫) */
const SEG_LABEL_SHARE = 0.07;

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3.5" y="7" width="9" height="6.5" rx="1" fill={locked ? "currentColor" : "none"} />
      <path d={locked ? "M5.5 7V5a2.5 2.5 0 0 1 5 0v2" : "M5.5 7V5a2.5 2.5 0 0 1 4.8-1"} />
    </svg>
  );
}

/** 값 칸: 글자는 칸이 들고, 치는 동안에는 초점을 받을 때의 묶음에서 다시 나눈다 */
function PartValue({
  id,
  label,
  value,
  max,
  unit,
  disabled,
  onType,
  onStep,
  onFocusBase,
}: {
  id: string;
  label: string;
  value: number;
  max: number;
  unit: string;
  disabled: boolean;
  /** 친 값(초점을 받을 때의 묶음에서 나눈다) */
  onType: (value: number) => void;
  /** 단추·화살표·휠(지금 묶음에서 나눈다) */
  onStep: (value: number) => void;
  onFocusBase: () => void;
}) {
  const shown = String(value);
  const [text, setText] = useState(shown);
  const [seen, setSeen] = useState(shown);
  const [editing, setEditing] = useState(false);
  // 바깥 값을 따른다(다른 칸을 바꾸거나 막대를 끌어 이 칸이 움직였을 때). 치는 중인 글자가 그 값을 낸 것이면(넘쳐서 잘린 값 포함) 그대로 둔다
  if (seen !== shown) {
    setSeen(shown);
    if (!(editing && text !== "" && Math.min(Number(text), max) === value)) setText(shown);
  }
  return (
    <NumberControl
      id={id}
      label={label}
      text={text}
      value={value}
      min={0}
      max={max}
      step={1}
      unit={unit}
      compact
      disabled={disabled}
      onAdjust={(next) => {
        setText(String(next));
        onStep(next);
      }}
      onText={(next) => {
        const digits = next.replace(/[^\d]/g, "");
        setText(digits);
        if (digits !== "") onType(Number.parseInt(digits, 10));
      }}
      inputProps={{
        inputMode: "numeric",
        onFocus: (event) => {
          setEditing(true);
          onFocusBase();
          event.currentTarget.select();
        },
        onBlur: () => {
          setEditing(false);
          setSeen(shown);
          setText(shown);
        },
      }}
    />
  );
}

export function DistributionControl({
  label,
  parts,
  values,
  total,
  pack,
  unit = "‰",
  onChange,
  renderReadout,
  tools,
  evenParts,
  className,
}: {
  /** 묶음 이름(읽는 이름) */
  label: string;
  parts: readonly DistributionPart[];
  /** 칸 값(정수). 합이 total이 아니어도 그린다(정규화 단추가 맞춘다) */
  values: readonly number[];
  total: number;
  /** 팩 값(칸마다 눈금, [팩 값으로]) */
  pack?: readonly number[] | undefined;
  unit?: string;
  /**
   * 새 묶음(늘 합 = total인 정수). source = 이어지는 조작의 열쇠("part:3"·"boundary:0" — 끌기·치기·걸음. 화면이 되돌리기 한 칸으로
   * 묶는 데 쓴다), 단추(균등·정규화·팩 값으로)는 undefined
   */
  onChange: (next: number[], source?: string) => void;
  /** 결과 읽기(기대값 등) — 끄는 동안의 값으로 부른다 */
  renderReadout?: ((values: readonly number[]) => ReactNode) | undefined;
  /** 덧붙일 단추(프리셋 등) */
  tools?: ReactNode;
  /** [균등]이 나눌 칸(없으면 잠그지 않은 모든 칸) */
  evenParts?: ReadonlySet<number> | undefined;
  className?: string | undefined;
}) {
  const baseId = useId();
  const barRef = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState<ReadonlySet<number>>(new Set());
  // 끄는 조작의 열쇠(놓을 때까지 같은 값)
  const source = useRef<string | undefined>(undefined);
  const drag = useDragCommit<number[]>((next) => onChange(next, source.current));
  // 조작을 시작할 때의 묶음(끄는 동안·치는 동안 여기서 다시 셈한다)
  const base = useRef<readonly number[]>(values);
  // 경계를 끄는 동안에는 손잡이 짝을 그대로 둔다(칸이 0이 되어도 손잡이가 사라지지 않게)
  const [handleBase, setHandleBase] = useState<readonly number[] | null>(null);
  const boundary = useRef<{ left: number; right: number; x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const shown = drag.live ?? values;
  const sum = sumOf(shown);
  const sumOk = sum === total;
  const range: SliderRange = { min: 0, max: total, scale: "linear", soft: false };

  const commit = (next: number[], from?: string): void => {
    if (!sameValues(next, values)) onChange(next, from);
  };
  const grabBase = (from?: string): void => {
    base.current = [...shown];
    source.current = from;
  };

  // 경계 손잡이 짝: 0이 아닌 이웃 칸끼리(끄는 동안에는 시작할 때의 짝)
  const pairSource = handleBase ?? shown;
  const visible = pairSource.map((_, index) => index).filter((index) => (pairSource[index] ?? 0) > 0);
  const pairs = visible.slice(0, -1).map((left, order) => ({ left, right: visible[order + 1] ?? left }));
  const cumulative = (through: number): number => sumOf(shown.slice(0, through + 1));

  const onHandleDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    pair: { left: number; right: number },
  ): void => {
    if (event.button !== 0 || locked.has(pair.left) || locked.has(pair.right)) return;
    const width = barRef.current?.getBoundingClientRect().width ?? 0;
    if (width <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    grabBase(`boundary:${pair.left}`);
    boundary.current = { ...pair, x: event.clientX, width };
    setHandleBase([...shown]);
    setDragging(pair.left);
  };
  const onHandleMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const at = boundary.current;
    if (!at || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const delta = Math.round(((event.clientX - at.x) / at.width) * sumOf(base.current));
    drag.move(moveBoundary(base.current, at.left, at.right, delta, locked));
  };
  const onHandleEnd = (): void => {
    if (!boundary.current) return;
    boundary.current = null;
    drag.end();
    setHandleBase(null);
    setDragging(null);
  };

  const toggleLock = (index: number): void => {
    const next = new Set(locked);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setLocked(next);
  };
  const lockedSum = sumOf(shown.filter((_, index) => locked.has(index)));
  const packDiffers = pack !== undefined && !sameValues(pack, values);

  return (
    <div
      className={`ce-dist ${className ?? ""}`}
      data-sum={sum}
      data-live={drag.live === null ? undefined : ""}
      data-locked={locked.size}
    >
      <div className="ce-dist-head">
        <span className="ce-dist-sum" data-invalid={sumOk ? undefined : ""} role="status">
          {sumOk ? m.dev_dist_sum_ok({ sum, unit }) : m.dev_dist_sum_bad({ sum, total, unit })}
        </span>
        {renderReadout ? <span className="ce-dist-readout">{renderReadout(shown)}</span> : null}
        <span className="ce-dist-tools">
          {tools}
          <button
            type="button"
            className="button-small ce-dist-even"
            onClick={() => commit(equalize(shown, total, locked, evenParts))}
          >
            {m.dev_dist_equalize()}
          </button>
          <button
            type="button"
            className="button-small ce-dist-normalize"
            aria-disabled={sumOk || undefined}
            onClick={sumOk ? undefined : () => commit(normalizeParts(shown, total, locked))}
          >
            {m.dev_dist_normalize()}
          </button>
          {pack ? (
            <button
              type="button"
              className="button-small ce-dist-pack"
              aria-disabled={!packDiffers || undefined}
              onClick={packDiffers ? () => commit([...pack]) : undefined}
            >
              {m.dev_dist_to_pack()}
            </button>
          ) : null}
          {locked.size > 0 ? (
            <button
              type="button"
              className="button-small ce-dist-unlock"
              onClick={() => setLocked(new Set())}
            >
              {m.dev_dist_unlock_all()}
            </button>
          ) : null}
        </span>
      </div>
      <div className="ce-dist-bar" ref={barRef}>
        <div className="ce-dist-stack" role="img" aria-label={m.dev_dist_bar({ name: label })}>
          {parts.map((part, index) => {
            const value = shown[index] ?? 0;
            if (value <= 0 || sum <= 0) return null;
            return (
              <span
                key={part.key}
                className="ce-dist-seg"
                data-tone={part.tone}
                data-part={part.key}
                data-locked={locked.has(index) ? "" : undefined}
                style={{ flexGrow: value }}
                title={`${part.label} ${value}${unit} (${shareLabel(value, sum)})`}
              >
                {value / sum >= SEG_LABEL_SHARE ? part.label : null}
              </span>
            );
          })}
        </div>
        {sum > 0
          ? pairs.map((pair) => {
              const off = locked.has(pair.left) || locked.has(pair.right);
              const name = m.dev_dist_boundary({
                left: parts[pair.left]?.label ?? "",
                right: parts[pair.right]?.label ?? "",
              });
              return (
                <button
                  key={pair.left}
                  type="button"
                  className="ce-dist-handle"
                  // 포인터용(키보드는 값 칸의 ↑↓): 탭 차례 밖
                  tabIndex={-1}
                  data-left={parts[pair.left]?.key}
                  data-right={parts[pair.right]?.key}
                  data-dragging={dragging === pair.left ? "" : undefined}
                  aria-label={name}
                  aria-disabled={off || undefined}
                  title={name}
                  style={{ insetInlineStart: `${(cumulative(pair.left) / sum) * 100}%` }}
                  onMouseDown={(event) => event.preventDefault()}
                  onPointerDown={(event) => onHandleDown(event, pair)}
                  onPointerMove={onHandleMove}
                  onPointerUp={onHandleEnd}
                  onPointerCancel={onHandleEnd}
                />
              );
            })
          : null}
      </div>
      <ul className="ce-dist-parts">
        {parts.map((part, index) => {
          const value = shown[index] ?? 0;
          const isLocked = locked.has(index);
          const packValue = pack?.[index];
          const partId = `${baseId}-${index}`;
          const reach = Math.max(0, total - (lockedSum - (isLocked ? value : 0)));
          return (
            <li
              key={part.key}
              className="ce-dist-part"
              data-part={part.key}
              data-value={value}
              data-locked={isLocked ? "" : undefined}
              data-dim={part.dim && value === 0 ? "" : undefined}
              data-changed={packValue !== undefined && packValue !== value ? "" : undefined}
            >
              <label className="ce-dist-name" htmlFor={partId}>
                <span className="ce-dist-chip" data-tone={part.tone} aria-hidden="true" />
                {part.label}
              </label>
              <SliderTrack
                label={m.dev_dist_part_slider({ name: part.label })}
                value={value}
                range={range}
                step={1}
                pack={packValue}
                unit={unit}
                ends={false}
                disabled={isLocked}
                onStart={() => grabBase(`part:${index}`)}
                onMove={(next) => drag.move(redistribute(base.current, index, next, total, locked))}
                onEnd={drag.end}
              />
              <span className="ce-dist-value">
                <PartValue
                  id={partId}
                  label={m.dev_dist_part_value({ name: part.label })}
                  value={value}
                  max={reach}
                  unit={unit}
                  disabled={isLocked}
                  onFocusBase={() => grabBase(`part:${index}`)}
                  onType={(next) =>
                    commit(redistribute(base.current, index, next, total, locked), `part:${index}`)
                  }
                  onStep={(next) => {
                    const after = redistribute(shown, index, next, total, locked);
                    base.current = after;
                    commit(after, `part:${index}`);
                  }}
                />
                <span className="ce-dist-share">{shareLabel(value, sum)}</span>
              </span>
              <button
                type="button"
                className="ce-dist-lock"
                aria-pressed={isLocked}
                aria-label={m.dev_dist_lock({ name: part.label })}
                title={m.dev_dist_lock({ name: part.label })}
                onClick={() => toggleLock(index)}
              >
                <LockIcon locked={isLocked} />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="ce-dist-help">{m.dev_dist_help()}</p>
    </div>
  );
}
