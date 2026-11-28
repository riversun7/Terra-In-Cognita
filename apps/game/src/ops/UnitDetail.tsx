// 운영자 콘솔 · 유닛 상세 — 자리·주인·부상·성장(레벨·경험치·스탯·성장 K)·작업 상태(직무·피로·일터·계약·생활 규칙·AI 작전·가는 곳)·
// 휴먼(도시·만족도·수명·스탯)·생명 수치·스킬·물건·화물.
// 통제: 멈추기(unit_stop)·안전한 곳으로(unit_rescue)·치료(unit_heal)·같은 2차맵 안 순간이동(unit_teleport). 사유는 감사 기록에 남는다.
// 유닛 지우기는 아직 없다(종류마다 정리할 자료가 달라 다음 단계 — docs/adr/2026-11-08-operator-console.md 4절).
import type {
  OpsPermission,
  OpsUnitDoing,
  OpsUnitGrowth,
  OpsUnitResult,
  OpsUnitWork,
} from "@terra/shared/ops";
import { useCallback, useId, useState } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { injuryStageName } from "../roster/InjuryBadge.tsx";
import { BalanceTable, ItemTable, SkillTable, StatLine } from "./DetailParts.tsx";
import type { OpenDetail } from "./OpsConsole.tsx";
import {
  ActionButton,
  KeyValues,
  LoadState,
  formatBig,
  formatInt,
  formatTime,
  UNIT_STATE_LABELS,
  jobLabel,
  resultText,
  unitKindLabel,
  useOpsLoad,
  whereText,
} from "./opsUi.tsx";

const DAY_MS = 86_400_000;

interface UnitDetailProps {
  unitId: number;
  can: (permission: OpsPermission) => boolean;
  open: OpenDetail;
}

const failure = (result: OpsUnitResult): string | null => (result === "ok" ? null : resultText(result));

const GROWTH_SOURCES = {
  cyborg: m.ops_growth_cyborg,
  human: m.ops_growth_human,
  cyborg_unit: m.ops_growth_cyborg_unit,
  unit: m.ops_growth_unit,
  baseline: m.ops_growth_baseline,
} as const;

const VIA_LABELS = { assign: m.ops_via_assign, wage: m.ops_via_wage, lease: m.ops_via_lease } as const;

/** 성장 판: 레벨·경험치·지금 스탯·처음 스탯·성장 K. 저장된 스탯이 없는 유닛은 안내 한 줄 */
function GrowthSection({ growth }: { growth: OpsUnitGrowth | null }) {
  return (
    <section data-ops-section="growth">
      <h3 className="ops-h3">{m.ops_sec_growth()}</h3>
      {growth ? (
        <>
          <KeyValues
            rows={[
              [m.ops_f_growth_source(), GROWTH_SOURCES[growth.source]()],
              [m.ops_col_level(), growth.source === "baseline" ? m.ops_none() : growth.level],
              [
                m.ops_f_exp(),
                growth.source === "baseline"
                  ? m.ops_none()
                  : growth.expSpan > 0
                    ? m.ops_f_of({ a: formatInt(growth.exp), b: formatInt(growth.expSpan) })
                    : m.ops_exp_max(),
              ],
              [m.ops_f_rebirths(), growth.rebirths],
              [m.ops_f_stats_now(), <StatLine key="now" values={growth.stats} />],
              [m.ops_f_stats_initial(), <StatLine key="initial" values={growth.initial} />],
              [
                m.ops_f_growth_k(),
                growth.kPm ? <StatLine key="k" values={growth.kPm} /> : m.ops_growth_k_default(),
              ],
            ]}
          />
          <p className="dev-muted">
            {growth.source === "baseline" ? m.ops_growth_none() : m.ops_growth_note()}
          </p>
        </>
      ) : (
        <p className="dev-muted">{m.ops_growth_none()}</p>
      )}
    </section>
  );
}

/** 작업 상태 판: 직무·단계·피로·일터·계약·생활 규칙·AI 작전·가는 곳 */
function WorkSection({
  job,
  work,
  doing,
  npcWorker,
}: {
  job: { kind: number; phase: number; progressMs: number; fatigue: number; fatigueEstimated?: boolean };
  work: OpsUnitWork | undefined;
  /** 지금 하는 일(하나) */
  doing: OpsUnitDoing;
  /** NPC 도시 일꾼인가(직무 상태가 없는 휴먼) */
  npcWorker: boolean;
}) {
  const place = work?.workplace ?? null;
  return (
    <section data-ops-section="work">
      <h3 className="ops-h3">{m.ops_sec_work()}</h3>
      <KeyValues
        rows={[
          [m.ops_f_job_state(), npcWorker ? m.ops_npc_worker() : jobLabel(job.kind)],
          [m.ops_f_doing(), UNIT_STATE_LABELS[doing]()],
          [m.ops_f_job_progress(), m.ops_f_ms({ ms: formatInt(job.progressMs) })],
          [
            m.ops_col_fatigue(),
            job.fatigueEstimated ? (
              <span key="fatigue">
                {formatInt(job.fatigue)} <span className="dev-muted">{m.ops_fatigue_estimated()}</span>
              </span>
            ) : (
              formatInt(job.fatigue)
            ),
          ],
          [
            m.ops_f_workplace(),
            place ? (
              <span key="place">
                {m.ops_work_building({ id: place.buildingId })}
                {place.facility ? <span className="dev-code"> {place.facility}</span> : null} ·{" "}
                {VIA_LABELS[place.via]()}
              </span>
            ) : (
              m.ops_none()
            ),
          ],
          [
            m.ops_f_contract(),
            place?.rate ? (
              <span key="contract" className="dev-code">
                {formatBig(place.rate)} {place.asset} · {place.state}
              </span>
            ) : (
              m.ops_none()
            ),
          ],
          [
            m.ops_f_life(),
            work?.life
              ? m.ops_life_value({
                  rest: work.life.restAt,
                  resume: work.life.resumeAt,
                  source: work.life.saved ? m.ops_life_saved() : m.ops_life_default(),
                })
              : m.ops_none(),
          ],
          [
            m.ops_f_tactics(),
            work?.tactics ? (
              <span key="tactics" className="dev-code">
                {work.tactics}
              </span>
            ) : (
              m.ops_tactics_default()
            ),
          ],
          [
            m.ops_f_destination(),
            work?.destination
              ? m.ops_destination_value({
                  x: work.destination.cellX,
                  y: work.destination.cellY,
                  time: formatTime(work.destination.arriveAtMs),
                })
              : m.ops_none(),
          ],
        ]}
      />
    </section>
  );
}

export function UnitDetail({ unitId, can, open }: UnitDetailProps) {
  const loaded = useOpsLoad(
    useCallback((signal: AbortSignal) => api.ops.units.get.query({ unitId }, { signal }), [unitId]),
  );
  const reasonId = useId();
  const xId = useId();
  const yId = useId();
  const [reason, setReason] = useState("");
  const [cellX, setCellX] = useState("");
  const [cellY, setCellY] = useState("");
  const data = loaded.data;
  const anyControl = can("unit_stop") || can("unit_rescue") || can("unit_heal") || can("unit_teleport");
  const target = `#${unitId}`;
  return (
    <div className="ops-stack">
      <div className="ops-toolbar">
        <h2 className="ops-h">{m.ops_detail_unit()}</h2>
        <button type="button" className="button-small" onClick={loaded.reload}>
          {m.ops_refresh()}
        </button>
      </div>
      <LoadState loaded={loaded} />
      {data ? (
        <>
          <KeyValues
            rows={[
              [m.ops_col_num(), data.unit.id],
              [m.ops_col_kind(), unitKindLabel(data.unit.kind)],
              [m.ops_col_name(), data.unit.name ?? m.ops_none()],
              [
                m.ops_col_owner(),
                <span key="owner" className="ops-inline-edit">
                  {data.unit.ownerUserId || typeof data.unit.ownerFactionId === "number" ? (
                    <button
                      type="button"
                      className="button-text"
                      translate="no"
                      onClick={() => {
                        if (data.unit.ownerUserId) open({ kind: "user", id: data.unit.ownerUserId });
                        else if (typeof data.unit.ownerFactionId === "number")
                          open({ kind: "faction", id: data.unit.ownerFactionId });
                      }}
                    >
                      {data.unit.ownerLabel}
                    </button>
                  ) : (
                    <span translate="no">{data.unit.ownerLabel}</span>
                  )}
                  <span className="dev-muted">({data.unit.ownerId})</span>
                  <button
                    type="button"
                    className="button-text"
                    data-ops-link="owner-units"
                    onClick={() =>
                      open({
                        kind: "units",
                        ownerId: data.unit.ownerId,
                        ownerKind: data.unit.ownerKind ?? undefined,
                        label: data.unit.ownerLabel,
                      })
                    }
                  >
                    {m.ops_link_owner_units()}
                  </button>
                </span>,
              ],
              [
                m.ops_col_where(),
                <span key="where" className="ops-inline-edit">
                  <span className="dev-code">{whereText(data.unit)}</span>
                  <button
                    type="button"
                    className="button-text"
                    onClick={() => open({ kind: "units", mapKey: data.unit.mapKey })}
                  >
                    {m.ops_link_map_units()}
                  </button>
                </span>,
              ],
              [m.ops_f_speed_size(), m.ops_f_of({ a: data.speed, b: data.size })],
              [m.ops_injury({ stage: injuryStageName(data.unit.injury) }), formatTime(data.injuryUntilMs)],
              [
                m.ops_f_held_by(),
                data.heldBy === null ? (
                  m.ops_none()
                ) : (
                  <button
                    key="held"
                    type="button"
                    className="button-text"
                    title={m.ops_link_owner_units()}
                    onClick={() =>
                      data.heldBy === null
                        ? undefined
                        : open({ kind: "units", ownerId: data.heldBy, label: `#${data.heldBy}` })
                    }
                  >
                    {data.heldBy}
                  </button>
                ),
              ],
            ]}
          />
          {anyControl ? (
            <section className="ops-controls">
              <h3 className="ops-h3">{m.ops_sec_controls()}</h3>
              <div className="ops-form">
                <label htmlFor={reasonId}>{m.ops_reason()}</label>
                <input
                  id={reasonId}
                  className="input"
                  maxLength={200}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              <div className="ops-actions">
                {can("unit_stop") ? (
                  <ActionButton
                    label={m.ops_act_stop()}
                    target={target}
                    run={async () => failure((await api.ops.units.stop.mutate({ unitId, reason })).result)}
                    onDone={loaded.reload}
                  />
                ) : null}
                {can("unit_rescue") ? (
                  <ActionButton
                    label={m.ops_act_rescue()}
                    target={target}
                    run={async () => failure((await api.ops.units.rescue.mutate({ unitId, reason })).result)}
                    onDone={loaded.reload}
                  />
                ) : null}
                {can("unit_heal") ? (
                  <ActionButton
                    label={m.ops_act_heal()}
                    target={target}
                    run={async () => failure((await api.ops.units.heal.mutate({ unitId, reason })).result)}
                    onDone={loaded.reload}
                  />
                ) : null}
              </div>
              {can("unit_teleport") ? (
                <div className="ops-actions">
                  <label htmlFor={xId}>{m.ops_act_cell_x()}</label>
                  <input
                    id={xId}
                    className="input ops-narrow"
                    inputMode="numeric"
                    value={cellX}
                    onChange={(event) => setCellX(event.target.value)}
                  />
                  <label htmlFor={yId}>{m.ops_act_cell_y()}</label>
                  <input
                    id={yId}
                    className="input ops-narrow"
                    inputMode="numeric"
                    value={cellY}
                    onChange={(event) => setCellY(event.target.value)}
                  />
                  <ActionButton
                    danger
                    label={m.ops_act_teleport()}
                    target={`${target} → (${cellX}, ${cellY})`}
                    run={async () => {
                      const x = /^[0-9]{1,4}$/.test(cellX.trim()) ? Number(cellX.trim()) : null;
                      const y = /^[0-9]{1,4}$/.test(cellY.trim()) ? Number(cellY.trim()) : null;
                      if (x === null || y === null) return m.ops_res_not_standable();
                      return failure(
                        (await api.ops.units.teleport.mutate({ unitId, cellX: x, cellY: y, reason })).result,
                      );
                    }}
                    onDone={loaded.reload}
                  />
                </div>
              ) : null}
              <p className="dev-muted">{m.ops_unit_remove_note()}</p>
            </section>
          ) : null}
          <GrowthSection growth={data.unit.growth ?? null} />
          <WorkSection
            job={data.job}
            work={data.work}
            doing={data.unit.doing ?? (data.unit.moving ? "moving" : "idle")}
            npcWorker={data.unit.npcWorker === true}
          />
          {data.human ? (
            <section>
              <h3 className="ops-h3">{m.ops_sec_human()}</h3>
              <KeyValues
                rows={[
                  [m.ops_f_city(), data.human.cityId ?? m.ops_none()],
                  [m.ops_f_satisfaction(), formatInt(data.human.satisfactionMilli)],
                  [m.ops_col_level(), data.human.level],
                  [
                    m.ops_f_age(),
                    m.ops_f_age_value({
                      age: Math.floor(data.human.ageMs / DAY_MS),
                      life: Math.floor(data.human.lifespanMs / DAY_MS),
                    }),
                  ],
                  [m.ops_f_rebirths(), data.human.rebirths],
                  [
                    m.ops_sec_stats(),
                    data.human.stats ? <StatLine key="s" values={data.human.stats} /> : m.ops_none(),
                  ],
                  [
                    m.ops_sec_elements(),
                    data.human.elements ? data.human.elements.join(" · ") : m.ops_none(),
                  ],
                ]}
              />
            </section>
          ) : null}
          {data.vitals ? (
            <section>
              <h3 className="ops-h3">{m.ops_sec_vitals()}</h3>
              <KeyValues
                rows={[
                  [
                    m.ops_f_hp(),
                    m.ops_f_of({ a: formatInt(data.vitals.hp), b: formatInt(data.vitals.maxHp) }),
                  ],
                  [
                    m.ops_f_armor(),
                    m.ops_f_of({ a: formatInt(data.vitals.armor), b: formatInt(data.vitals.maxArmor) }),
                  ],
                  [
                    m.ops_f_shield(),
                    m.ops_f_of({ a: formatInt(data.vitals.shield), b: formatInt(data.vitals.maxShield) }),
                  ],
                ]}
              />
            </section>
          ) : null}
          <section>
            <h3 className="ops-h3">{m.ops_sec_skills()}</h3>
            <SkillTable rows={data.skills} />
          </section>
          <section>
            <h3 className="ops-h3">{m.ops_sec_items()}</h3>
            <ItemTable rows={data.items} />
          </section>
          <section>
            <h3 className="ops-h3">{m.ops_sec_cargo()}</h3>
            <BalanceTable rows={data.cargo} />
          </section>
        </>
      ) : null}
    </div>
  );
}
