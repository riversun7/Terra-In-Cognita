// 유닛 AI 작전 판(유닛 화면) — 기획 D-5039·D-5040(7항목 슬라이더 0~10 + 4프리셋, 목표 우선순위), 60 §5.3·50 제안 "프리셋 먼저, 7항목은 접어 둠".
// 질문 2021·2023 답(encounter-4): 플레이어 유닛의 조우 판단(먼저 걸지·회피할지)과 조우 전투 퇴각 기준이 이 값을 쓴다. 저장은 WebSocket unit_tactics
// (프로토콜 50, 답 travel_result) — 서버가 내 판단 유닛인지 다시 본다. 저장한 적이 없으면 기본 프리셋(균형)을 보인다.
// [임시] 세계에 파티 묶음이 없어 유닛마다 정한다(질문 2131). 전투 안 움직임(② ~ ⑥·목표)은 전투 AI 줄기가 읽는다 — 지금은 저장만.
import {
  AI_PRESETS,
  AI_RETREAT_MAX,
  AI_SLIDERS,
  AI_SLIDER_MAX,
  AI_TARGETS,
  type AiPreset,
  type AiSlider,
  type AiTactics,
  type AiTarget,
  DEFAULT_PLAYER_PRESET,
  presetTactics,
  tacticsMatchPreset,
} from "@terra/shared/aiTactics";
import { useId, useState } from "react";
import { sendTravelCommand } from "../map/travelCommands.ts";
import { m } from "../paraglide/messages.js";
import { Section } from "../roster/parts.tsx";
import "./tactics.css";

const PRESET_TEXT: Readonly<Record<AiPreset, () => string>> = {
  aggressive: m.tactics_preset_aggressive,
  balanced: m.tactics_preset_balanced,
  defensive: m.tactics_preset_defensive,
  hold: m.tactics_preset_hold,
};

const SLIDER_TEXT: Readonly<Record<AiSlider, () => string>> = {
  engage: m.tactics_slider_engage,
  pursue: m.tactics_slider_pursue,
  cover: m.tactics_slider_cover,
  escort: m.tactics_slider_escort,
  saveSkill: m.tactics_slider_save_skill,
  spread: m.tactics_slider_spread,
};

const TARGET_TEXT: Readonly<Record<AiTarget, () => string>> = {
  nearest: m.tactics_target_nearest,
  weakest: m.tactics_target_weakest,
  threat: m.tactics_target_threat,
};

/** 보낸 결과 → 문구 */
function resultText(code: string): string {
  if (code === "forbidden") return m.tactics_result_forbidden();
  if (code === "unknown_unit") return m.tactics_result_unknown();
  if (code === "offline") return m.tactics_result_offline();
  return m.tactics_result_retry();
}

export function TacticsPanel({
  id,
  unit,
  saved,
}: {
  readonly id: string;
  /** 세계 유닛 번호 */
  readonly unit: number;
  /** 저장한 작전(없으면 null — 기본 프리셋) */
  readonly saved: AiTactics | null;
}) {
  const fieldId = useId();
  const [tactics, setTactics] = useState<AiTactics>(saved ?? presetTactics(DEFAULT_PLAYER_PRESET));
  const [stored, setStored] = useState<AiTactics | null>(saved);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = JSON.stringify(tactics) !== JSON.stringify(stored ?? presetTactics(DEFAULT_PLAYER_PRESET));
  const edited = !tacticsMatchPreset(tactics);

  const save = (): void => {
    setSending(true);
    setNotice(null);
    void sendTravelCommand({ t: "unit_tactics", unitId: unit, ...tactics })
      .then((outcome) => {
        if (outcome.ok) {
          setStored(tactics);
          setNotice(m.tactics_saved());
        } else setNotice(resultText(outcome.code));
      })
      .finally(() => setSending(false));
  };

  return (
    <Section id={id} title={m.tactics_title()}>
      <div className="tactics" data-part="unit-tactics">
        <p className="roster-note">{m.tactics_hint()}</p>
        <div className="tactics-presets" role="group" aria-label={m.tactics_preset_label()}>
          {AI_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="button-small tactics-preset"
              aria-pressed={tactics.preset === preset}
              onClick={() => setTactics(presetTactics(preset))}
            >
              {PRESET_TEXT[preset]()}
            </button>
          ))}
        </div>
        <p className="roster-meta">
          {edited
            ? m.tactics_edited({ preset: PRESET_TEXT[tactics.preset]() })
            : m.tactics_summary({
                engage: String(tactics.engage),
                retreat: String(tactics.retreatPct),
              })}
        </p>
        <details className="tactics-details">
          <summary>{m.tactics_details()}</summary>
          <div className="tactics-sliders">
            {AI_SLIDERS.map((key) => (
              <label key={key} className="tactics-slider" htmlFor={`${fieldId}-${key}`}>
                <span>{SLIDER_TEXT[key]()}</span>
                <input
                  id={`${fieldId}-${key}`}
                  type="range"
                  min={0}
                  max={AI_SLIDER_MAX}
                  step={1}
                  value={tactics[key]}
                  onChange={(event) => setTactics({ ...tactics, [key]: Number(event.target.value) })}
                />
                <span className="roster-num">{tactics[key]}</span>
              </label>
            ))}
            <label className="tactics-slider" htmlFor={`${fieldId}-retreat`}>
              <span>{m.tactics_slider_retreat()}</span>
              <input
                id={`${fieldId}-retreat`}
                type="range"
                min={0}
                max={AI_RETREAT_MAX}
                step={10}
                value={tactics.retreatPct}
                onChange={(event) => setTactics({ ...tactics, retreatPct: Number(event.target.value) })}
              />
              <span className="roster-num">{m.tactics_percent({ value: String(tactics.retreatPct) })}</span>
            </label>
            <label className="tactics-slider" htmlFor={`${fieldId}-target`}>
              <span>{m.tactics_target_label()}</span>
              <select
                id={`${fieldId}-target`}
                value={tactics.target}
                onChange={(event) => {
                  const target = AI_TARGETS.find((value) => value === event.target.value);
                  if (target) setTactics({ ...tactics, target });
                }}
              >
                {AI_TARGETS.map((target) => (
                  <option key={target} value={target}>
                    {TARGET_TEXT[target]()}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>
        <div className="tactics-actions">
          <button type="button" className="button-small" disabled={sending || !dirty} onClick={save}>
            {m.tactics_save()}
          </button>
          {notice ? (
            <p className="roster-note" role="status">
              {notice}
            </p>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
