// 수 조작 칸(편집기 공용) — docs/adr/2026-11-10-editor-input-controls.md. 글자 칸 하나에 − / + 단추, 막대, 이름표 끌기를 붙인다.
// - 빽빽한 표 칸(밸런스 가중치 표·전투 실험실)은 steppers={false}로 단추 없이 ↑↓·PageUp/PageDown·휠만 쓴다.
// - 글자는 부르는 쪽이 든다(text·onText). 조작(단추·막대·끌기·휠·화살표)은 onAdjust(다음 값)로만 알린다: 값은 늘 범위 안 정수다.
// - − / + : 한 번 = 한 걸음, 누르고 있으면 잇달아(오래 누르면 5배). Shift = 10배, Alt = 1. 탭 차례에는 들지 않는다(글자 칸의 ↑↓가 같은 일).
// - 글자 칸: ↑↓ = 한 걸음, Shift = 10배, PageUp/PageDown = 10배. 휠은 초점이 있을 때만. Alt+↑↓는 화면 단축키에 남긴다.
// - 막대(role="slider"): 기술 범위가 넓으면 로그 눈금이나 값 둘레 창(contentEditorNumeric.sliderRange). 팩 값 자리에 눈금(그 자리를
//   누르거나 가까이 끌면 팩 값에 달라붙는다. 눈금은 보이기만 해서 손잡이를 가리지 않는다).
//   끄는 동안 값은 화면에 바로 보이고 바깥에는 80ms 간격으로 알린다(놓을 때 마지막 값). 마우스로 누르면 글자 칸에 초점을 준다.
// - 이름표 끌기(scrubRef): 좌우로 4화소에 한 걸음(Shift = 10배, Alt = 8화소에 1). 누르기만 하면 이름표 그대로(칸에 초점).
// 막대는 <input>이 아니라 div다: 칸 안의 input은 글자 칸 하나뿐이다(시험·화면이 ".칸 input"으로 찾는다).
import {
  type InputHTMLAttributes,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import {
  type NumberScale,
  type SliderRange,
  type StepMods,
  clampInt,
  posToValue,
  scrubDelta,
  sliderRange,
  stepOf,
  stepWithMods,
  valueToPos,
} from "./contentEditorNumeric.ts";
import "./contentEditorInputs.css";

/** 누르고 있기: 처음 기다림 · 잇달아 간격 · 이만큼 되풀이하면 5배 */
const HOLD_DELAY_MS = 350;
const HOLD_EVERY_MS = 70;
const HOLD_FAST_AFTER = 15;
/** 끄는 동안 바깥에 알리는 간격 */
const DRAG_COMMIT_MS = 80;
/** 막대에서 팩 값 눈금에 달라붙는 거리(화소): 눈금을 누르거나 가까이 끌면 팩 값 */
const PACK_SNAP_PX = 6;

const formatInt = (value: number): string => new Intl.NumberFormat(getLocale()).format(value);
/** 막대 끝 값 글(짧게: 1,000,000 → 100만·1M) */
const formatEnd = (value: number): string =>
  new Intl.NumberFormat(getLocale(), { notation: "compact", maximumFractionDigits: 1 }).format(value);

export interface DragCommit<T> {
  /** 끄는 중이면 그 값(화면에 바로 보인다) */
  readonly live: T | null;
  readonly move: (value: T) => void;
  /** 놓음: 밀린 값을 알리고 끝낸다 */
  readonly end: () => void;
}

/** 끄는 동안의 값: 화면에는 바로, 바깥(commit)에는 간격을 두고 알린다(화소마다 담지 않는다) */
export function useDragCommit<T>(commit: (value: T) => void, ms = DRAG_COMMIT_MS): DragCommit<T> {
  const [live, setLive] = useState<T | null>(null);
  const waiting = useRef<{ readonly value: T } | null>(null);
  const timer = useRef<number | null>(null);
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const flush = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const item = waiting.current;
    waiting.current = null;
    if (item) commitRef.current(item.value);
  };
  return {
    live,
    move: (value) => {
      setLive(value);
      waiting.current = { value };
      timer.current ??= window.setTimeout(flush, ms);
    },
    end: () => {
      flush();
      setLive(null);
    },
  };
}

/** 누르고 있으면 잇달아 부른다(단추). 손을 떼거나 벗어나면 멈춘다 */
function useHoldRepeat(action: (mods: StepMods, factor: number) => void): {
  readonly start: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  readonly stop: () => void;
} {
  const timers = useRef<{ delay: number | null; every: number | null }>({ delay: null, every: null });
  const actionRef = useRef(action);
  useEffect(() => {
    actionRef.current = action;
  });
  const stop = (): void => {
    if (timers.current.delay !== null) window.clearTimeout(timers.current.delay);
    if (timers.current.every !== null) window.clearInterval(timers.current.every);
    timers.current = { delay: null, every: null };
  };
  // 떠날 때 남은 시계를 지운다
  useEffect(() => {
    const held = timers;
    return () => {
      if (held.current.delay !== null) window.clearTimeout(held.current.delay);
      if (held.current.every !== null) window.clearInterval(held.current.every);
    };
  }, []);
  return {
    start: (event) => {
      if (event.button !== 0) return;
      stop();
      const mods = { shift: event.shiftKey, alt: event.altKey };
      actionRef.current(mods, 1);
      timers.current.delay = window.setTimeout(() => {
        let count = 0;
        timers.current.every = window.setInterval(() => {
          count += 1;
          actionRef.current(mods, count > HOLD_FAST_AFTER ? 5 : 1);
        }, HOLD_EVERY_MS);
      }, HOLD_DELAY_MS);
    },
    stop,
  };
}

function Stepper({
  direction,
  label,
  disabled,
  onStep,
}: {
  direction: -1 | 1;
  label: string;
  disabled: boolean;
  onStep: (direction: -1 | 1, mods: StepMods, factor: number) => void;
}) {
  const hold = useHoldRepeat((mods, factor) => onStep(direction, mods, factor));
  return (
    <button
      type="button"
      className="ce-step"
      data-step={direction < 0 ? "down" : "up"}
      // 탭 차례 밖: 글자 칸의 ↑↓가 같은 일을 한다(칸마다 탭이 세 번 걸리지 않게)
      tabIndex={-1}
      disabled={disabled}
      aria-label={label}
      title={label}
      // 누를 때 글자 칸의 초점을 빼앗지 않는다
      onMouseDown={(event) => event.preventDefault()}
      onPointerDown={hold.start}
      onPointerUp={hold.stop}
      onPointerLeave={hold.stop}
      onPointerCancel={hold.stop}
      onContextMenu={(event) => event.preventDefault()}
      // 키보드·읽기 프로그램의 누름(포인터 없이 온 click)
      onClick={(event) => {
        if (event.detail === 0) onStep(direction, { shift: event.shiftKey, alt: event.altKey }, 1);
      }}
    >
      <span aria-hidden="true">{direction < 0 ? "−" : "+"}</span>
    </button>
  );
}

/** 막대(팩 값 눈금 + 손잡이). 값이 없으면(빈 선택 칸) 손잡이를 숨긴다 */
export function SliderTrack({
  label,
  value,
  range,
  step,
  pack,
  unit,
  ends = true,
  onMove,
  onEnd,
  onStart,
  onKeyStep,
  disabled = false,
  focusable = false,
}: {
  label: string;
  value: number | null;
  range: SliderRange;
  step: number;
  pack?: number | undefined;
  unit?: string | undefined;
  /** 양 끝 값 글 */
  ends?: boolean;
  onMove: (value: number) => void;
  onEnd: () => void;
  onStart?: ((event: ReactPointerEvent<HTMLDivElement>) => void) | undefined;
  /** 막대에 초점이 있을 때의 키(걸음 수: ±1, ±10, 끝 = ±Infinity) */
  onKeyStep?: ((steps: number) => void) | undefined;
  disabled?: boolean;
  /** 탭 차례에 넣는다(글자 칸이 없는 곳) */
  focusable?: boolean;
}) {
  const pos = value === null ? null : valueToPos(value, range);
  const packPos =
    pack !== undefined && pack >= range.min && pack <= range.max ? valueToPos(pack, range) : null;
  const valueAt = (event: ReactPointerEvent<HTMLDivElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    const at = rect.width <= 0 ? 0 : (event.clientX - rect.left) / rect.width;
    // 팩 값 눈금 가까이에서는 팩 값에 달라붙는다(눈금을 누르면 팩 값)
    if (packPos !== null && pack !== undefined && Math.abs(at - packPos) * rect.width <= PACK_SNAP_PX)
      return pack;
    return posToValue(at, range, step);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!onKeyStep || disabled || event.altKey || event.ctrlKey || event.metaKey) return;
    const big = event.shiftKey ? 10 : 1;
    const steps =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? big
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -big
          : event.key === "PageUp"
            ? 10
            : event.key === "PageDown"
              ? -10
              : event.key === "Home"
                ? Number.NEGATIVE_INFINITY
                : event.key === "End"
                  ? Number.POSITIVE_INFINITY
                  : 0;
    if (steps === 0) return;
    event.preventDefault();
    onKeyStep(steps);
  };
  return (
    <span className="ce-slider-row" data-scale={range.scale} data-soft={range.soft ? "" : undefined}>
      <span className="ce-slider-box">
        <div
          className="ce-slider"
          role="slider"
          tabIndex={focusable && !disabled ? 0 : -1}
          aria-label={label}
          aria-orientation="horizontal"
          aria-valuemin={range.min}
          aria-valuemax={range.max}
          aria-valuenow={value ?? range.min}
          aria-valuetext={value === null ? undefined : `${formatInt(value)}${unit ?? ""}`}
          aria-disabled={disabled || undefined}
          title={
            packPos === null || pack === undefined
              ? undefined
              : m.dev_input_pack_tick({ value: formatInt(pack) })
          }
          onKeyDown={onKeyDown}
          // 누를 때 초점을 옮기지 않는다(글자 칸의 ↑↓·휠이 이어지게). 탭 차례에 든 막대만 스스로 초점을 받는다
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            if (disabled || event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            if (focusable) event.currentTarget.focus({ preventScroll: true });
            onStart?.(event);
            onMove(valueAt(event));
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            onMove(valueAt(event));
          }}
          onPointerUp={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            event.currentTarget.releasePointerCapture(event.pointerId);
            onEnd();
          }}
          onPointerCancel={onEnd}
        >
          <span className="ce-slider-rail" />
          {pos === null ? null : <span className="ce-slider-fill" style={{ inlineSize: `${pos * 100}%` }} />}
          {pos === null ? null : (
            <span className="ce-slider-thumb" style={{ insetInlineStart: `${pos * 100}%` }} />
          )}
        </div>
        {/* 팩 값 눈금: 보이기만 한다(막대를 가리지 않게 — 눈금 자리를 누르면 막대가 팩 값에 달라붙는다) */}
        {packPos === null ? null : (
          <span
            className="ce-slider-pack"
            aria-hidden="true"
            style={{ insetInlineStart: `${packPos * 100}%` }}
          />
        )}
      </span>
      {ends ? (
        <span className="ce-slider-ends" aria-hidden="true">
          <span>{formatEnd(range.min)}</span>
          <span>
            {formatEnd(range.max)}
            {range.soft ? "+" : ""}
            {range.scale === "log" ? (
              <abbr className="ce-slider-scale" title={m.dev_input_scale_log()}>
                {" "}
                log
              </abbr>
            ) : null}
          </span>
        </span>
      ) : null}
    </span>
  );
}

export interface NumberControlProps {
  readonly id: string;
  /** 읽는 이름(단추·막대) */
  readonly label: string;
  /** 칸 글자(부르는 쪽이 든다) */
  readonly text: string;
  readonly onText: (text: string) => void;
  /** 조작의 바탕 = 지금 맞는 값(글자가 틀렸거나 비었으면 null) */
  readonly value: number | null;
  readonly min: number;
  readonly max: number;
  /** 조작으로 바뀐 값(범위 안 정수) */
  readonly onAdjust: (value: number) => void;
  /** 팩 값(막대 눈금, 누르면 그 값) */
  readonly pack?: number | undefined;
  readonly unit?: string | undefined;
  /** 표 칸: 막대·이름표 끌기 없이 단추만(slider로 켤 수 있다) */
  readonly compact?: boolean | undefined;
  readonly slider?: boolean | undefined;
  readonly scale?: NumberScale | undefined;
  readonly soft?: readonly [number, number] | undefined;
  readonly step?: number | undefined;
  /** 이름표(좌우로 끌어 바꾼다) */
  readonly scrubRef?: RefObject<HTMLElement | null> | undefined;
  /** − / + 단추(기본 켬). 빽빽한 표 칸은 끄고 ↑↓·휠만 쓴다 */
  readonly steppers?: boolean | undefined;
  /** 잠금(고칠 수 없음) */
  readonly disabled?: boolean | undefined;
  readonly inputClassName?: string | undefined;
  readonly inputProps?:
    | Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "onChange" | "className">
    | undefined;
}

export function NumberControl({
  id,
  label,
  text,
  onText,
  value,
  min,
  max,
  onAdjust,
  pack,
  unit,
  compact = false,
  slider,
  scale,
  soft,
  step: fixedStep,
  scrubRef,
  steppers = true,
  disabled = false,
  inputClassName,
  inputProps,
}: NumberControlProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const base = value ?? clampInt(pack ?? 0, min, max);
  const drag = useDragCommit<number>(onAdjust);
  // 끄는 동안에는 막대 범위(값 둘레 창)가 흔들리지 않게 처음 범위를 든다
  const [frozen, setFrozen] = useState<SliderRange | null>(null);
  const range = frozen ?? sliderRange({ min, max, value: base, pack, scale, soft });
  const step = Math.max(1, Math.round(fixedStep ?? stepOf(range, base)));
  const showSlider = (slider ?? !compact) && max > min;
  const shown = drag.live ?? value;

  const nudge = (direction: -1 | 1, mods: StepMods, factor: number): void => {
    if (disabled) return;
    const next = clampInt(base + direction * stepWithMods(step, mods) * factor, min, max);
    if (next !== value) onAdjust(next);
  };

  // 휠·이름표 끌기는 직접 단 듣는 함수라 마지막으로 그린 값을 ref로 읽는다
  const latest = useRef({ base, step, min, max, nudge, drag });
  useEffect(() => {
    latest.current = { base, step, min, max, nudge, drag };
  });

  // 휠: 초점이 있을 때만(지나가다 값이 바뀌지 않게). 화면이 구르지 않게 막아야 해서 passive가 아니다
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return undefined;
    const onWheel = (event: WheelEvent): void => {
      if (document.activeElement !== input || event.deltaY === 0) return;
      event.preventDefault();
      latest.current.nudge(event.deltaY < 0 ? 1 : -1, { shift: event.shiftKey }, 1);
    };
    input.addEventListener("wheel", onWheel, { passive: false });
    return () => input.removeEventListener("wheel", onWheel);
  }, []);

  // 이름표 끌기: 4화소 넘게 가로로 끌면 시작한다(그 전에는 보통 누름 = 칸에 초점)
  useEffect(() => {
    const target = scrubRef?.current;
    if (!target) return undefined;
    let start: { x: number; base: number; id: number; active: boolean } | null = null;
    const onDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      start = { x: event.clientX, base: latest.current.base, id: event.pointerId, active: false };
    };
    const onMove = (event: PointerEvent): void => {
      if (!start || event.pointerId !== start.id) return;
      const dx = event.clientX - start.x;
      if (!start.active) {
        if (Math.abs(dx) < 4) return;
        start.active = true;
        target.setPointerCapture(event.pointerId);
        target.setAttribute("data-scrubbing", "");
      }
      event.preventDefault();
      const now = latest.current;
      const delta = scrubDelta(dx, now.step, { shift: event.shiftKey, alt: event.altKey });
      now.drag.move(clampInt(start.base + delta, now.min, now.max));
    };
    const onUp = (event: PointerEvent): void => {
      if (!start || event.pointerId !== start.id) return;
      const active = start.active;
      start = null;
      target.removeAttribute("data-scrubbing");
      if (active) latest.current.drag.end();
    };
    target.setAttribute("data-scrub", "");
    target.setAttribute("title", m.dev_input_scrub_hint());
    target.addEventListener("pointerdown", onDown);
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
    return () => {
      target.removeAttribute("data-scrub");
      target.removeAttribute("title");
      target.removeEventListener("pointerdown", onDown);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
    };
  }, [scrubRef]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    inputProps?.onKeyDown?.(event);
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    // Alt·Ctrl·⌘+화살표는 화면 단축키(다음 항목 등)에 남긴다
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const direction =
      event.key === "ArrowUp" || event.key === "PageUp"
        ? 1
        : event.key === "ArrowDown" || event.key === "PageDown"
          ? -1
          : 0;
    if (direction === 0) return;
    event.preventDefault();
    nudge(direction, { shift: event.shiftKey }, event.key.startsWith("Page") ? 10 : 1);
  };

  const stepText = formatInt(step);
  return (
    <span
      className="ce-num"
      data-compact={compact ? "" : undefined}
      data-live={drag.live === null ? undefined : ""}
    >
      <span className="ce-num-row">
        {steppers ? (
          <Stepper
            direction={-1}
            label={m.dev_input_decrease({ name: label, step: stepText })}
            disabled={disabled}
            onStep={nudge}
          />
        ) : null}
        <input
          {...inputProps}
          id={id}
          ref={inputRef}
          className={`input ce-number ${inputClassName ?? ""}`}
          // 수 칸 표시(편집기의 Ctrl+Z 되돌리기가 이 칸에서는 브라우저 대신 받는다)
          data-num=""
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          value={drag.live === null ? text : String(drag.live)}
          onChange={(event) => onText(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {steppers ? (
          <Stepper
            direction={1}
            label={m.dev_input_increase({ name: label, step: stepText })}
            disabled={disabled}
            onStep={nudge}
          />
        ) : null}
        {unit ? (
          <span className="ce-unit" aria-hidden="true">
            {unit}
          </span>
        ) : null}
      </span>
      {showSlider ? (
        <SliderTrack
          label={m.dev_input_slider({ name: label })}
          value={shown}
          range={range}
          step={step}
          pack={pack}
          unit={unit}
          ends={!compact}
          disabled={disabled}
          onStart={(event) => {
            setFrozen(range);
            // 마우스로 누르면 글자 칸에 초점(↑↓·휠이 이어진다). 터치는 자판이 뜨지 않게 그대로 둔다
            if (event.pointerType === "mouse") inputRef.current?.focus({ preventScroll: true });
          }}
          onMove={drag.move}
          onEnd={() => {
            drag.end();
            setFrozen(null);
          }}
        />
      ) : null}
    </span>
  );
}
