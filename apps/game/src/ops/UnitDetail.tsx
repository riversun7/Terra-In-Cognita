// 운영자 콘솔 · 유닛 상세 — 자리·주인·직무·부상·휴먼(도시·만족도·수명·스탯)·생명 수치·스킬·물건·화물.
// 통제: 멈추기(unit_stop)·안전한 곳으로(unit_rescue)·치료(unit_heal)·같은 2차맵 안 순간이동(unit_teleport). 사유는 감사 기록에 남는다.
// 유닛 지우기는 아직 없다(종류마다 정리할 자료가 달라 다음 단계 — docs/adr/2026-11-08-operator-console.md 4절).
import type { OpsPermission, OpsUnitResult } from "@terra/shared/ops";
import { useCallback, useId, useState } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { BalanceTable, ItemTable, SkillTable, StatLine } from "./DetailParts.tsx";
import {
  ActionButton,
  KeyValues,
  LoadState,
  formatInt,
  formatTime,
  resultText,
  unitKindLabel,
  useOpsLoad,
  whereText,
} from "./opsUi.tsx";

const DAY_MS = 86_400_000;

interface UnitDetailProps {
  unitId: number;
  can: (permission: OpsPermission) => boolean;
}

const failure = (result: OpsUnitResult): string | null => (result === "ok" ? null : resultText(result));

export function UnitDetail({ unitId, can }: UnitDetailProps) {
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
              [m.ops_col_owner(), `${data.unit.ownerLabel} (${data.unit.ownerId})`],
              [m.ops_col_where(), whereText(data.unit)],
              [m.ops_f_speed_size(), m.ops_f_of({ a: data.speed, b: data.size })],
              [
                m.ops_f_job(),
                `${data.job.kind} / ${data.job.phase} / ${formatInt(data.job.progressMs)} / ${formatInt(data.job.fatigue)}`,
              ],
              [m.ops_col_status(), data.unit.moving ? m.ops_status_moving() : m.ops_none()],
              [m.ops_injury({ stage: data.unit.injury }), formatTime(data.injuryUntilMs)],
              [m.ops_f_held_by(), data.heldBy ?? m.ops_none()],
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
