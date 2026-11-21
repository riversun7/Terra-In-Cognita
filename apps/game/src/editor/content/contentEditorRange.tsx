// 구간(최소~최대) 조작 칸(편집기 공용) — docs/adr/2026-11-20-npc-autonomous-ai.md.
// - 양쪽 손잡이(low·high)를 포인터·키보드로 끌어 [min, max] 안에서 low <= high인 정수 구간을 고른다.
// - 팩 기본 구간(packLow·packHigh)이 있으면 주황 눈금으로 표시한다.
// - 끄는 동안 화면에는 바로 반영하고, 바깥에는 useDragCommit(80ms)으로 모아 알린다.
import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, useRef, useState } from "react";
import { getLocale } from "../../paraglide/runtime.js";
import { useDragCommit } from "./contentEditorNumber.tsx";
import { clampInt } from "./contentEditorNumeric.ts";
import "./contentEditorRange.css";

const formatInt = (value: number): string => new Intl.NumberFormat(getLocale()).format(value);
const formatEnd = (value: number): string =>
  new Intl.NumberFormat(getLocale(), { notation: "compact", maximumFractionDigits: 1 }).format(value);

/** 막대 비율(0~1) → step에 맞춘 범위 안 정수 */
function ratioToStepInt(ratio: number, min: number, max: number, step: number): number {
  const clampedRatio = Math.min(1, Math.max(0, ratio));
  const raw = min + clampedRatio * (max - min);
  const snapped = min + Math.round((raw - min) / step) * step;
  return clampInt(snapped, min, max);
}

/** 값 → 막대 위 백분율(0~100) */
function valuePct(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

export interface RangeControlProps {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly low: number;
  readonly high: number;
  readonly packLow?: number | undefined;
  readonly packHigh?: number | undefined;
  readonly step?: number | undefined;
  readonly unit?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly onChange: (nextLow: number, nextHigh: number) => void;
}

export function RangeControl({
  id,
  label,
  min,
  max,
  low,
  high,
  packLow,
  packHigh,
  step: rawStep = 1,
  unit,
  disabled = false,
  onChange,
}: RangeControlProps) {
  const step = Math.max(1, Math.round(rawStep));
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useDragCommit<readonly [number, number]>(([nextLow, nextHigh]) => onChange(nextLow, nextHigh));
  const [active, setActive] = useState<"low" | "high" | null>(null);
  const activeRef = useRef<"low" | "high" | null>(null);

  const shownLow = drag.live ? drag.live[0] : clampInt(Math.min(low, high), min, max);
  const shownHigh = drag.live ? drag.live[1] : clampInt(Math.max(low, high), min, max);

  const [lowText, setLowText] = useState(String(shownLow));
  const [highText, setHighText] = useState(String(shownHigh));
  const [seenLow, setSeenLow] = useState(shownLow);
  const [seenHigh, setSeenHigh] = useState(shownHigh);
  if (seenLow !== shownLow) {
    setSeenLow(shownLow);
    setLowText(String(shownLow));
  }
  if (seenHigh !== shownHigh) {
    setSeenHigh(shownHigh);
    setHighText(String(shownHigh));
  }

  const commit = (nextLow: number, nextHigh: number): void => {
    const clampedLow = clampInt(nextLow, min, max);
    const clampedHigh = clampInt(Math.max(clampedLow, nextHigh), min, max);
    if (clampedLow !== low || clampedHigh !== high) onChange(clampedLow, clampedHigh);
  };

  const valueFromPointer = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return min;
    return ratioToStepInt((clientX - rect.left) / rect.width, min, max, step);
  };

  const moveHandle = (handle: "low" | "high", clientX: number): void => {
    const val = valueFromPointer(clientX);
    if (handle === "low") {
      const nextLow = clampInt(val, min, shownHigh);
      drag.move([nextLow, shownHigh]);
    } else {
      const nextHigh = clampInt(val, shownLow, max);
      drag.move([shownLow, nextHigh]);
    }
  };

  const onTrackDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (disabled || event.button !== 0) return;
    const val = valueFromPointer(event.clientX);
    const distLow = Math.abs(val - shownLow);
    const distHigh = Math.abs(val - shownHigh);
    const chosen: "low" | "high" =
      distLow < distHigh || (distLow === distHigh && val <= shownLow) ? "low" : "high";
    activeRef.current = chosen;
    setActive(chosen);
    event.currentTarget.setPointerCapture(event.pointerId);
    moveHandle(chosen, event.clientX);
  };

  const onTrackMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!activeRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    moveHandle(activeRef.current, event.clientX);
  };

  const onTrackUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!activeRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activeRef.current = null;
    setActive(null);
    drag.end();
  };

  const onThumbKey = (handle: "low" | "high", event: KeyboardEvent<HTMLButtonElement>): void => {
    if (disabled || event.altKey || event.ctrlKey || event.metaKey) return;
    const mult = event.shiftKey ? 10 : 1;
    let delta: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") delta = step * mult;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") delta = -step * mult;
    else if (event.key === "PageUp") delta = step * 10;
    else if (event.key === "PageDown") delta = -step * 10;
    else if (event.key === "Home") delta = Number.NEGATIVE_INFINITY;
    else if (event.key === "End") delta = Number.POSITIVE_INFINITY;
    if (delta === null) return;
    event.preventDefault();
    if (handle === "low") {
      const next =
        delta === Number.NEGATIVE_INFINITY
          ? min
          : delta === Number.POSITIVE_INFINITY
            ? shownHigh
            : clampInt(shownLow + delta, min, shownHigh);
      commit(next, shownHigh);
    } else {
      const next =
        delta === Number.NEGATIVE_INFINITY
          ? shownLow
          : delta === Number.POSITIVE_INFINITY
            ? max
            : clampInt(shownHigh + delta, shownLow, max);
      commit(shownLow, next);
    }
  };

  const onInputKey = (handle: "low" | "high", event: KeyboardEvent<HTMLInputElement>): void => {
    if (disabled || event.altKey || event.ctrlKey || event.metaKey) return;
    const dir = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
    if (dir === 0) return;
    event.preventDefault();
    const delta = dir * step * (event.shiftKey ? 10 : 1);
    if (handle === "low") commit(clampInt(shownLow + delta, min, shownHigh), shownHigh);
    else commit(shownLow, clampInt(shownHigh + delta, shownLow, max));
  };

  const applyTyped = (handle: "low" | "high", raw: string): void => {
    const cleaned = raw.replaceAll(/[\s,_]/g, "");
    if (!/^-?\d+$/.test(cleaned)) {
      if (handle === "low") setLowText(String(shownLow));
      else setHighText(String(shownHigh));
      return;
    }
    const parsed = Number.parseInt(cleaned, 10);
    if (!Number.isSafeInteger(parsed)) return;
    if (handle === "low") {
      const nextLow = clampInt(parsed, min, shownHigh);
      setLowText(String(nextLow));
      commit(nextLow, shownHigh);
    } else {
      const nextHigh = clampInt(parsed, shownLow, max);
      setHighText(String(nextHigh));
      commit(shownLow, nextHigh);
    }
  };

  const lowPct = valuePct(shownLow, min, max);
  const highPct = valuePct(shownHigh, min, max);
  const showPackLow = packLow !== undefined && packLow >= min && packLow <= max;
  const showPackHigh = packHigh !== undefined && packHigh >= min && packHigh <= max;

  return (
    <div
      className="ce-range"
      data-live={drag.live === null ? undefined : ""}
      data-disabled={disabled ? "" : undefined}
    >
      <div className="ce-range-head">
        <span className="ce-range-label">{label}</span>
        <span className="ce-range-inputs">
          <input
            id={`${id}-low`}
            className="input ce-range-input"
            data-num=""
            inputMode="numeric"
            aria-label={`${label} min`}
            disabled={disabled}
            value={lowText}
            onChange={(event) => setLowText(event.target.value)}
            onBlur={() => applyTyped("low", lowText)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyTyped("low", lowText);
              else onInputKey("low", event);
            }}
          />
          <span className="ce-range-tilde" aria-hidden="true">
            ~
          </span>
          <input
            id={`${id}-high`}
            className="input ce-range-input"
            data-num=""
            inputMode="numeric"
            aria-label={`${label} max`}
            disabled={disabled}
            value={highText}
            onChange={(event) => setHighText(event.target.value)}
            onBlur={() => applyTyped("high", highText)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyTyped("high", highText);
              else onInputKey("high", event);
            }}
          />
          {unit ? (
            <span className="ce-range-unit" aria-hidden="true">
              {unit}
            </span>
          ) : null}
        </span>
      </div>
      <div className="ce-range-box">
        <div
          ref={trackRef}
          className="ce-range-track"
          onPointerDown={onTrackDown}
          onPointerMove={onTrackMove}
          onPointerUp={onTrackUp}
          onPointerCancel={onTrackUp}
        >
          <span className="ce-range-rail" />
          <span
            className="ce-range-fill"
            style={{
              insetInlineStart: `${lowPct}%`,
              inlineSize: `${Math.max(0, highPct - lowPct)}%`,
            }}
          />
          {showPackLow ? (
            <span
              className="ce-range-pack"
              aria-hidden="true"
              style={{ insetInlineStart: `${valuePct(packLow, min, max)}%` }}
            />
          ) : null}
          {showPackHigh ? (
            <span
              className="ce-range-pack"
              aria-hidden="true"
              style={{ insetInlineStart: `${valuePct(packHigh, min, max)}%` }}
            />
          ) : null}
          <button
            type="button"
            role="slider"
            className="ce-range-thumb"
            data-handle="low"
            data-active={active === "low" ? "" : undefined}
            aria-label={`${label} min`}
            aria-valuemin={min}
            aria-valuemax={shownHigh}
            aria-valuenow={shownLow}
            aria-valuetext={`${formatInt(shownLow)}${unit ?? ""}`}
            disabled={disabled}
            style={{ insetInlineStart: `${lowPct}%` }}
            onKeyDown={(event) => onThumbKey("low", event)}
            onPointerDown={(event) => {
              if (disabled || event.button !== 0) return;
              event.stopPropagation();
              activeRef.current = "low";
              setActive("low");
              trackRef.current?.setPointerCapture(event.pointerId);
            }}
          />
          <button
            type="button"
            role="slider"
            className="ce-range-thumb"
            data-handle="high"
            data-active={active === "high" ? "" : undefined}
            aria-label={`${label} max`}
            aria-valuemin={shownLow}
            aria-valuemax={max}
            aria-valuenow={shownHigh}
            aria-valuetext={`${formatInt(shownHigh)}${unit ?? ""}`}
            disabled={disabled}
            style={{ insetInlineStart: `${highPct}%` }}
            onKeyDown={(event) => onThumbKey("high", event)}
            onPointerDown={(event) => {
              if (disabled || event.button !== 0) return;
              event.stopPropagation();
              activeRef.current = "high";
              setActive("high");
              trackRef.current?.setPointerCapture(event.pointerId);
            }}
          />
        </div>
      </div>
      <span className="ce-range-ends" aria-hidden="true">
        <span>{formatEnd(min)}</span>
        <span>{formatEnd(max)}</span>
      </span>
    </div>
  );
}
