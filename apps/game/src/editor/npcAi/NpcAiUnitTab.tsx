// 탭 2: 유닛 일상·순찰·가문 AI 주기 · 탐색 온도 · 비상 스위치 · 24시간 일과 미리보기 — docs/adr/2026-11-20-npc-autonomous-ai.md
import type { TuningEntryView } from "@terra/shared/tuning";
import { DEFAULT_UNIT_TRAITS, type TraitAxis, type UnitTraits } from "@terra/shared/unitTraits";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { NpcAiNumberField, NpcAiRangeField } from "./NpcAiField.tsx";
import { type NpcAiPending, TRAIT_AXIS_META, buildTuningValuesRecord, effectiveValue } from "./npcAiModel.ts";

interface SwitchSpec {
  readonly id: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly descKo: string;
  readonly descEn: string;
}

const AI_SWITCHES: readonly SwitchSpec[] = [
  {
    id: "n53_npc_ai_enabled",
    titleKo: "NPC 세력 자율 AI (N53)",
    titleEn: "NPC Faction AI (N53)",
    descKo: "국가·도시 전략 판단(전쟁·개척·교역·세율) 전체 스위치",
    descEn: "Master toggle for nation/city strategic AI decisions",
  },
  {
    id: "npc_ai_unit_enabled",
    titleKo: "유닛 개별 자율행동 AI",
    titleEn: "Unit Autonomous AI",
    descKo: "2차맵 시민·경비대·지도자 상태 기계(순찰·시장·휴식·대피) 스위치",
    descEn: "Toggle for secondary-map unit autonomous FSM behavior",
  },
  {
    id: "npc_ai_house_enabled",
    titleKo: "NPC 가문 자율 AI",
    titleEn: "NPC House AI",
    descKo: "NPC 가문 입단비·금고 배당·사업장 입찰·이주 판단 스위치",
    descEn: "Toggle for NPC house autonomous management AI",
  },
];

type ScheduleRole = "citizen" | "worker" | "guard" | "leader";
const SCHEDULE_ROLES: readonly ScheduleRole[] = ["citizen", "worker", "guard", "leader"];
const isScheduleRole = (value: string): value is ScheduleRole =>
  (SCHEDULE_ROLES as readonly string[]).includes(value);

type SchedulePreview = Awaited<ReturnType<typeof api.npcAi.previewUnitSchedule.query>>;

const STATE_LABELS: Readonly<
  Record<string, { readonly ko: string; readonly en: string; readonly tone: number }>
> = {
  // 일(work)은 일감에 따라 나눠 보인다: 일터·둘레 채집·운반
  "work:post": { ko: "근무", en: "Work", tone: 2 },
  "work:forage": { ko: "채집", en: "Forage", tone: 1 },
  "work:haul": { ko: "운반", en: "Haul", tone: 4 },
  rest: { ko: "휴식", en: "Rest", tone: 0 },
  need: { ko: "욕구", en: "Needs", tone: 5 },
  patrol: { ko: "순찰", en: "Patrol", tone: 6 },
  evade: { ko: "회피", en: "Evade", tone: 7 },
};

/** 2차 지수·가문 일 지시·가문 금고 설정 칸(이름은 팩 항목 이름) */
const HOUSE_ORDER_FIELDS: readonly { readonly id: string; readonly step: number }[] = [
  { id: "npc_ai_drive_work_mood_floor_pm", step: 10 },
  { id: "npc_ai_drive_work_hunger_floor_pm", step: 10 },
  { id: "npc_ai_house_check_ms", step: 10_000 },
  { id: "npc_ai_house_unfed_below_pm", step: 10 },
  { id: "npc_ai_house_food_short_share_pm", step: 10 },
  { id: "npc_ai_house_morale_low_below", step: 1 },
  { id: "npc_ai_house_refuse_below_pm", step: 10 },
  { id: "npc_ai_house_tax_pm", step: 10 },
  { id: "npc_ai_house_care_min_pm", step: 10 },
  { id: "npc_ai_house_care_max_pm", step: 10 },
  { id: "npc_ai_offline_steward_after_ms", step: 60_000 },
];

/** 2차 지수 이름(근로 의욕·복종도·위험 감수·소비 성향) */
const DRIVE_LABELS: readonly {
  readonly key: "work" | "obedience" | "risk" | "spend";
  readonly ko: string;
  readonly en: string;
}[] = [
  { key: "work", ko: "근로 의욕", en: "Work drive" },
  { key: "obedience", ko: "복종도", en: "Obedience" },
  { key: "risk", ko: "위험 감수", en: "Risk" },
  { key: "spend", ko: "소비 성향", en: "Spending" },
];

export function NpcAiUnitTab({
  entries,
  byId,
  pending,
  ko,
  onStage,
}: {
  readonly entries: readonly TuningEntryView[];
  readonly byId: ReadonlyMap<string, TuningEntryView>;
  readonly pending: NpcAiPending;
  readonly ko: boolean;
  readonly onStage: (patch: Readonly<Record<string, number | null>>, editKey?: string) => void;
}) {
  const [role, setRole] = useState<ScheduleRole>("worker");
  const [hasWorkplace, setHasWorkplace] = useState(true);
  const [hasMarket, setHasMarket] = useState(true);
  const [traits, setTraits] = useState<UnitTraits>({
    ...DEFAULT_UNIT_TRAITS,
    discipline: 680,
    openness: 600,
    boldness: 550,
  });
  const [satisfaction, setSatisfaction] = useState(70);
  const [fedPm, setFedPm] = useState(1000);
  const [schedule, setSchedule] = useState<SchedulePreview | null>(null);

  const tuningValues = useMemo(() => buildTuningValuesRecord(entries, pending), [entries, pending]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api.npcAi.previewUnitSchedule
        .query({ traits, role, hasWorkplace, hasMarket, satisfaction, fedPm, tuningValues })
        .then(
          (res) => {
            if (!cancelled) setSchedule(res);
          },
          () => {
            // 미리보기 실패 시 직전 값 유지
          },
        );
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fedPm, hasMarket, hasWorkplace, role, satisfaction, traits, tuningValues]);

  const setAxis = (axis: TraitAxis, value: number): void => {
    setTraits((prev) => ({ ...prev, [axis]: value }));
  };

  return (
    <div className="na-tab-body">
      {/* 비상 스위치 3종 */}
      <section className="panel na-card">
        <div className="na-card-head">
          <h2>{m.dev_npc_ai_switches_title()}</h2>
          <p className="na-hint">{m.dev_npc_ai_switches_desc()}</p>
        </div>
        <div className="na-switch-grid">
          {AI_SWITCHES.map((sw) => {
            const val = effectiveValue(byId, pending, sw.id, 1);
            const on = val === 1;
            return (
              <div key={sw.id} className="na-switch-card" data-on={on ? "" : undefined}>
                <div>
                  <strong className="na-switch-title">{ko ? sw.titleKo : sw.titleEn}</strong>
                  <p className="na-hint">{ko ? sw.descKo : sw.descEn}</p>
                  <code className="na-field-id">{sw.id}</code>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  className={on ? "button-primary button-small" : "button-small"}
                  onClick={() => onStage({ [sw.id]: on ? 0 : 1 })}
                >
                  {on ? (ko ? "켜짐 (1)" : "ON (1)") : ko ? "꺼짐 (0)" : "OFF (0)"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* 유닛 자율행동 주기·반경 구간 */}
      <section className="panel na-card">
        <div className="na-card-head">
          <h2>{m.dev_npc_ai_unit_title()}</h2>
          <p className="na-hint">{m.dev_npc_ai_unit_desc()}</p>
        </div>
        <div className="na-grid-2">
          <NpcAiRangeField
            minId="npc_ai_unit_reeval_min_ms"
            maxId="npc_ai_unit_reeval_max_ms"
            label={ko ? "유닛 재평가 주기 (ms)" : "Unit AI re-eval interval (ms)"}
            byId={byId}
            pending={pending}
            step={1000}
            onStage={onStage}
          />
          <NpcAiRangeField
            minId="npc_ai_unit_dwell_min_ms"
            maxId="npc_ai_unit_dwell_max_ms"
            label={ko ? "상태 최소 체류 시간 — 진동 방지 (ms)" : "Min state dwell time (ms)"}
            byId={byId}
            pending={pending}
            step={1000}
            onStage={onStage}
          />
          <NpcAiRangeField
            minId="npc_ai_guard_patrol_min_cells"
            maxId="npc_ai_guard_patrol_max_cells"
            label={ko ? "경비대 순찰 반경 (칸)" : "Guard patrol radius (cells)"}
            byId={byId}
            pending={pending}
            step={1}
            onStage={onStage}
          />
          <NpcAiRangeField
            minId="npc_ai_house_decide_min_ms"
            maxId="npc_ai_house_decide_max_ms"
            label={ko ? "NPC 가문 판단 주기 (ms)" : "NPC house decision interval (ms)"}
            byId={byId}
            pending={pending}
            step={60_000}
            onStage={onStage}
          />
          <NpcAiNumberField
            id="npc_ai_leader_roam_cells"
            byId={byId}
            pending={pending}
            ko={ko}
            step={1}
            onStage={onStage}
          />
          <NpcAiNumberField
            id="npc_ai_decision_temp_pm"
            byId={byId}
            pending={pending}
            ko={ko}
            step={10}
            onStage={onStage}
          />
        </div>
      </section>

      {/* 2차 지수·가문 일 지시·가문 금고 설정 칸(docs/adr/2026-11-21-npc-needs-drives.md) */}
      <section className="panel na-card">
        <div className="na-card-head">
          <h2>{m.dev_npc_ai_house_orders_title()}</h2>
          <p className="na-hint">{m.dev_npc_ai_house_orders_desc()}</p>
        </div>
        <div className="na-grid-2">
          {HOUSE_ORDER_FIELDS.map((field) => (
            <NpcAiNumberField
              key={field.id}
              id={field.id}
              byId={byId}
              pending={pending}
              ko={ko}
              step={field.step}
              onStage={onStage}
            />
          ))}
        </div>
      </section>

      {/* 가상 유닛 24시간 5상태 FSM 예상 시간표 */}
      <section className="panel na-card">
        <div className="na-card-head">
          <h2>{m.dev_npc_ai_schedule_title()}</h2>
          <p className="na-hint">{m.dev_npc_ai_schedule_desc()}</p>
        </div>
        <div className="na-grid-2">
          <div className="na-stack">
            <div className="na-inline-controls">
              <label className="na-inline-select">
                <span>{ko ? "직군" : "Role"}</span>
                <select
                  className="input"
                  value={role}
                  onChange={(e) => {
                    if (isScheduleRole(e.target.value)) setRole(e.target.value);
                  }}
                >
                  <option value="worker">{ko ? "시설 일꾼" : "Worker"}</option>
                  <option value="citizen">{ko ? "일반 시민" : "Citizen"}</option>
                  <option value="guard">{ko ? "경비대" : "Guard"}</option>
                  <option value="leader">{ko ? "국가 지도자" : "Leader"}</option>
                </select>
              </label>
              <label className="na-check">
                <input
                  type="checkbox"
                  checked={hasWorkplace}
                  onChange={(e) => setHasWorkplace(e.target.checked)}
                />
                <span>{ko ? "일터 있음" : "Has workplace"}</span>
              </label>
              <label className="na-check">
                <input type="checkbox" checked={hasMarket} onChange={(e) => setHasMarket(e.target.checked)} />
                <span>{ko ? "시장 있음" : "Has market"}</span>
              </label>
            </div>
            <label className="na-axis-row">
              <span className="na-axis-name">{ko ? "만족도 (= 충성도)" : "Satisfaction (= loyalty)"}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={satisfaction}
                onChange={(e) => setSatisfaction(Number(e.target.value))}
              />
              <span className="na-axis-val">{satisfaction}</span>
            </label>
            <label className="na-axis-row">
              <span className="na-axis-name">{ko ? "그날 식사 몫 (‰)" : "Food share today (‰)"}</span>
              <input
                type="range"
                min={0}
                max={1000}
                step={50}
                value={fedPm}
                onChange={(e) => setFedPm(Number(e.target.value))}
              />
              <span className="na-axis-val">{fedPm}</span>
            </label>
            {TRAIT_AXIS_META.map((meta) => (
              <label key={meta.axis} className="na-axis-row">
                <span className="na-axis-name">
                  {ko ? `${meta.ko} (${meta.lowKo}↔${meta.highKo})` : meta.en}
                </span>
                <input
                  type="range"
                  min={0}
                  max={1000}
                  step={10}
                  value={traits[meta.axis]}
                  onChange={(e) => setAxis(meta.axis, Number(e.target.value))}
                />
                <span className="na-axis-val">{traits[meta.axis]}</span>
              </label>
            ))}
          </div>

          <div className="na-preview-box">
            {schedule ? (
              <>
                <div className="na-override-kpi">
                  <span>{ko ? "경비 순찰 반경" : "Guard patrol radius"}</span>
                  <strong>{schedule.patrolRadiusCells}</strong>
                  <span className="na-hint">
                    {ko
                      ? `칸 · 지도자 순회 ${schedule.leaderRoamRadiusCells}칸`
                      : `cells · leader roam ${schedule.leaderRoamRadiusCells} cells`}
                  </span>
                </div>
                {DRIVE_LABELS.map((drive) => (
                  <div key={drive.key} className="na-override-kpi">
                    <span>{ko ? drive.ko : drive.en}</span>
                    <strong>{schedule.drives[drive.key]}</strong>
                    <span className="na-hint">/ 1000</span>
                  </div>
                ))}
                <div className="na-timeline" role="list" aria-label={m.dev_npc_ai_schedule_title()}>
                  {schedule.slots.map((slot) => {
                    const label = slot.job ? `${slot.state}:${slot.job}` : slot.state;
                    const info = STATE_LABELS[label] ?? { ko: label, en: label, tone: 0 };
                    return (
                      <div
                        key={slot.hour}
                        role="listitem"
                        className="na-timeline-slot"
                        data-tone={info.tone}
                        title={`${String(slot.hour).padStart(2, "0")}:00 ${ko ? info.ko : info.en} (${ko ? "피로" : "fatigue"} ${Math.round(slot.fatiguePm / 10)}%)`}
                      >
                        <span className="na-timeline-hour">{slot.hour}</span>
                        <span className="na-timeline-state">{ko ? info.ko : info.en}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="na-hint">{m.dev_npc_ai_lab_running()}</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
