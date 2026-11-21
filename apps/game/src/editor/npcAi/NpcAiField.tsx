// NPC AI 에디터 공용 단일 수치 칸 + 구간 칸 래퍼 — docs/adr/2026-11-20-npc-autonomous-ai.md
import type { TuningEntryView } from "@terra/shared/tuning";
import { useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { NumberControl } from "../content/contentEditorNumber.tsx";
import { RangeControl } from "../content/contentEditorRange.tsx";
import { type NpcAiPending, effectiveValue, packValueOf } from "./npcAiModel.ts";

/** 단일 튜닝 키를 NumberControl 한 줄로 그린다 */
export function NpcAiNumberField({
  id,
  byId,
  pending,
  ko,
  label,
  step = 1,
  onStage,
}: {
  readonly id: string;
  readonly byId: ReadonlyMap<string, TuningEntryView>;
  readonly pending: NpcAiPending;
  readonly ko: boolean;
  readonly label?: string | undefined;
  readonly step?: number | undefined;
  readonly onStage: (patch: Readonly<Record<string, number | null>>, editKey?: string) => void;
}) {
  const inputId = useId();
  const entry = byId.get(id);
  const val = effectiveValue(byId, pending, id, entry?.packValue ?? 0);
  const pack = packValueOf(byId, id, val);
  const min = entry?.min ?? 0;
  const max = entry?.max ?? 100_000;
  const shown = String(val);
  const [text, setText] = useState(shown);
  const [seen, setSeen] = useState(shown);
  if (seen !== shown) {
    setSeen(shown);
    setText(shown);
  }
  if (!entry) return null;
  const title = label ?? (ko ? entry.name.ko : entry.name.en);
  const changed = val !== pack;
  const isStaged = pending.has(id);
  return (
    <div className="na-field" data-changed={changed ? "" : undefined} data-staged={isStaged ? "" : undefined}>
      <div className="na-field-head">
        <label className="na-field-label" htmlFor={inputId}>
          <span>{title}</span>
          <code className="na-field-id">{id}</code>
        </label>
        {changed ? (
          <button type="button" className="button-small na-reset-btn" onClick={() => onStage({ [id]: null })}>
            {m.dev_npc_ai_reset_pack()} ({pack})
          </button>
        ) : null}
      </div>
      <NumberControl
        id={inputId}
        label={title}
        text={text}
        value={val}
        min={min}
        max={max}
        pack={pack}
        step={step}
        unit={entry.unit ?? undefined}
        onAdjust={(next) => {
          setText(String(next));
          onStage({ [id]: next }, id);
        }}
        onText={(raw) => {
          setText(raw);
          const cleaned = raw.replaceAll(/[\s,_]/g, "");
          if (/^-?\d+$/.test(cleaned)) {
            const parsed = Number.parseInt(cleaned, 10);
            if (Number.isSafeInteger(parsed) && parsed >= min && parsed <= max) {
              onStage({ [id]: parsed }, id);
            }
          }
        }}
        inputProps={{
          inputMode: "numeric",
          onBlur: () => setText(shown),
        }}
      />
    </div>
  );
}

/** min/max 쌍 튜닝 키를 RangeControl 하나로 그린다 */
export function NpcAiRangeField({
  minId,
  maxId,
  label,
  byId,
  pending,
  step = 1,
  unit,
  onStage,
}: {
  readonly minId: string;
  readonly maxId: string;
  readonly label: string;
  readonly byId: ReadonlyMap<string, TuningEntryView>;
  readonly pending: NpcAiPending;
  readonly step?: number | undefined;
  readonly unit?: string | undefined;
  readonly onStage: (patch: Readonly<Record<string, number | null>>, editKey?: string) => void;
}) {
  const controlId = useId();
  const minEntry = byId.get(minId);
  const maxEntry = byId.get(maxId);
  if (!minEntry || !maxEntry) return null;
  const boundMin = minEntry.min ?? 0;
  const boundMax = maxEntry.max ?? 1000;
  const low = effectiveValue(byId, pending, minId, minEntry.packValue);
  const high = effectiveValue(byId, pending, maxId, maxEntry.packValue);
  const changed = low !== minEntry.packValue || high !== maxEntry.packValue;
  return (
    <div
      className="na-field"
      data-changed={changed ? "" : undefined}
      data-staged={pending.has(minId) || pending.has(maxId) ? "" : undefined}
    >
      <RangeControl
        id={controlId}
        label={label}
        min={boundMin}
        max={boundMax}
        low={low}
        high={high}
        packLow={minEntry.packValue}
        packHigh={maxEntry.packValue}
        step={step}
        unit={unit ?? minEntry.unit ?? undefined}
        onChange={(nextLow, nextHigh) =>
          onStage({ [minId]: nextLow, [maxId]: nextHigh }, `${minId}:${maxId}`)
        }
      />
    </div>
  );
}
