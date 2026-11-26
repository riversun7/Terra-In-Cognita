// 유닛 생활 규칙 판(유닛 화면) — 사용자 결정 2026-11-26("120 다 채우고 휴식으로 가는게 아니다 … 유닛 성향, 주인유저가 규칙 설정 가능.
// 유닛페이지에서 … 설정가능하게"), docs/adr/2026-11-26-unit-life-rules.md. 일하다 피로가 [쉬러 가는 피로]에 닿으면 쉬고, [다시 일하는 피로]까지
// 풀리면 다시 일한다. 저장하면 서버가 다음 정산부터 쓴다(프로토콜 75 unit_life, 답 travel_result). 정한 적이 없으면 성향 기본값(첫 불이익 구간
// 시작 ± 규율)이 온다. 포만감(음식 섭취) 규칙은 서버에 포만감 값이 생기면 이 판에 칸을 더한다.
import { LIFE_FATIGUE_LIMIT, type UnitLifeRules, isUnitLifeRules } from "@terra/shared/unitLife";
import type { RosterLife } from "@terra/shared/roster";
import { useId, useState } from "react";
import { sendTravelCommand } from "../map/travelCommands.ts";
import { m } from "../paraglide/messages.js";
import { Section } from "../roster/parts.tsx";
import "./tactics.css";

/** 슬라이더 걸음(점) */
const STEP = 5;

/** 보낸 결과 → 문구 */
function resultText(code: string): string {
  if (code === "forbidden") return m.life_result_forbidden();
  if (code === "unknown_unit") return m.life_result_unknown();
  if (code === "offline") return m.tactics_result_offline();
  return m.tactics_result_retry();
}

export function LifeRulesPanel({
  id,
  unit,
  saved,
}: {
  readonly id: string;
  /** 세계 유닛 번호 */
  readonly unit: number;
  /** 서버가 준 지금 규칙(주인이 정한 값 또는 성향 기본값) */
  readonly saved: RosterLife;
}) {
  const fieldId = useId();
  const [rules, setRules] = useState<UnitLifeRules>({ restAt: saved.restAt, resumeAt: saved.resumeAt });
  const [stored, setStored] = useState<UnitLifeRules>({ restAt: saved.restAt, resumeAt: saved.resumeAt });
  const [custom, setCustom] = useState(saved.saved);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = rules.restAt !== stored.restAt || rules.resumeAt !== stored.resumeAt;

  const save = (): void => {
    if (!isUnitLifeRules(rules)) return;
    setSending(true);
    setNotice(null);
    void sendTravelCommand({ t: "unit_life", unitId: unit, restAt: rules.restAt, resumeAt: rules.resumeAt })
      .then((outcome) => {
        if (outcome.ok) {
          setStored(rules);
          setCustom(true);
          setNotice(m.life_saved());
        } else setNotice(resultText(outcome.code));
      })
      .finally(() => setSending(false));
  };

  return (
    <Section id={id} title={m.life_title()}>
      <div className="tactics" data-part="unit-life" data-saved={custom ? "true" : "false"}>
        <p className="roster-note">{m.life_hint()}</p>
        <p className="roster-meta">{custom ? m.life_source_owner() : m.life_source_temper()}</p>
        <div className="tactics-sliders">
          <label className="tactics-slider" htmlFor={`${fieldId}-rest`}>
            <span>{m.life_rest_at()}</span>
            <input
              id={`${fieldId}-rest`}
              type="range"
              min={STEP}
              max={LIFE_FATIGUE_LIMIT}
              step={STEP}
              value={rules.restAt}
              onChange={(event) => {
                const restAt = Number(event.target.value);
                // 다시 일하는 피로는 늘 쉬러 가는 피로보다 낮다
                setRules({ restAt, resumeAt: Math.min(rules.resumeAt, restAt - STEP) });
              }}
            />
            <span className="roster-num" data-part="life-rest">
              {rules.restAt}
            </span>
          </label>
          <label className="tactics-slider" htmlFor={`${fieldId}-resume`}>
            <span>{m.life_resume_at()}</span>
            <input
              id={`${fieldId}-resume`}
              type="range"
              min={0}
              max={LIFE_FATIGUE_LIMIT - STEP}
              step={STEP}
              value={rules.resumeAt}
              onChange={(event) =>
                setRules({ ...rules, resumeAt: Math.min(Number(event.target.value), rules.restAt - STEP) })
              }
            />
            <span className="roster-num" data-part="life-resume">
              {rules.resumeAt}
            </span>
          </label>
        </div>
        <div className="tactics-actions">
          <button type="button" className="button-small" disabled={sending || !dirty} onClick={save}>
            {m.life_save()}
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
