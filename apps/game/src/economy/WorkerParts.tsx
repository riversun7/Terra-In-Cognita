// 채집 시설 카드의 일꾼 칸 — 직무 배치(내 유닛 → 내 채집 시설, 돈 없음)·일하는 유닛 목록·빼기.
// docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산", 기획 60_UX §7.1 ③(첫 유닛 고용·직무 배치 → "없는 동안에도 일합니다", D-6045)·D-506·D-507.
// - 판정은 서버(labor_assign·labor_unassign, 프로토콜 14 — 소유·일터·자리·바쁨, 판 15 같은 2차맵). 화면은 그 시설과 같은 2차맵의 쉬는 유닛만
//   고르게 하고(기획 정리 D-518 522 ①, 다른 2차맵 유닛 수는 한 줄로) 자리가 차면 단추를 막는다.
// - 스탯 짝(주 = 진행 속도, 보조 = 수확량)을 유닛 고르기에 함께 보인다(유닛 1차 스탯, 입은 장비 포함).
// - 산출은 그 시설이 선 도시의 내 도시 창고로 간다(도시가 없으면 이 건물 창고).
// - 병원(의료 단계, D-521 — docs/adr/2026-11-08-injury.md): 같은 칸으로 의사를 직무 배치한다. 스탯은 INT + WIS(치료 배율), 산출 없음.
// - 일터로 걸어가기(사용자 결정 D-591, 질문 2656 나 — 서버 labor/walkToWork.ts): 일을 맡은 유닛은 그 시설 둘레로 걸어가고, 닿기 전에는 일하지 않는다.
//   그동안 일꾼 줄에 "일터로 가는 중 · 도착 …"을 보인다(commuteUntil).
import type { FacilitiesOverviewResponse, FacilityView, FacilityWorkerView } from "@terra/shared/facilities";
import { useState } from "react";
import { m } from "../paraglide/messages.js";
import { dateText, relativeText } from "../sections/screenText.ts";
import { useCityText } from "./cityText.ts";
import type { LaborRun } from "./laborText.ts";

type Stat = "str" | "dex" | "agi" | "vit" | "int" | "wis";

const STAT_CODE: Readonly<Record<Stat, () => string>> = {
  str: m.roster_stat_str_code,
  dex: m.roster_stat_dex_code,
  agi: m.roster_stat_agi_code,
  vit: m.roster_stat_vit_code,
  int: m.roster_stat_int_code,
  wis: m.roster_stat_wis_code,
};

const isStat = (code: string): code is Stat => code in STAT_CODE;

/** 스탯 코드 글(모르는 코드는 그대로) */
const statName = (code: string): string => (isStat(code) ? STAT_CODE[code]() : code);

function workerLine(worker: FacilityWorkerView): string {
  if (worker.via === "assign")
    return worker.cyborg
      ? m.facility_worker_assign_cyborg()
      : m.facility_worker_assign_unit({ id: worker.unitId });
  if (!worker.mine) return m.facility_worker_other({ id: worker.unitId });
  return worker.via === "wage"
    ? m.facility_worker_wage({ id: worker.unitId })
    : m.facility_worker_lease({ id: worker.unitId });
}

export function FacilityWorkers({
  facility,
  data,
  runLabor,
  busy,
}: {
  facility: FacilityView;
  data: FacilitiesOverviewResponse;
  runLabor: LaborRun;
  busy: boolean;
}) {
  const gather = facility.gather;
  const medical = facility.medical === true;
  const idle = data.units.filter((unit) => !unit.busy);
  // 같은 2차맵의 유닛만 둘 수 있다(522 ①)
  const free = idle.filter((unit) => unit.mapKey === facility.mapKey);
  const elsewhere = idle.length - free.length;
  const [picked, setPicked] = useState<number | null>(null);
  const cityText = useCityText();
  if (!gather && !medical) return null;
  const unitId = free.some((unit) => unit.id === picked) ? picked : (free[0]?.id ?? null);
  const full = facility.workers.length >= facility.slots;
  const built = facility.level >= 1;
  const statText = (unit: (typeof free)[number]): string => {
    if (!gather) return m.facility_worker_stats_medical({ stat: unit.stats.int + unit.stats.wis });
    const main = isStat(gather.primary) ? unit.stats[gather.primary] : 0;
    const sub = isStat(gather.secondary) ? unit.stats[gather.secondary] : 0;
    return m.facility_worker_stats({
      primary: statName(gather.primary),
      main,
      secondary: statName(gather.secondary),
      sub,
    });
  };
  const fieldId = `facility-worker-${facility.buildingId}`;
  return (
    <fieldset className="facility-workers" data-part="facility-workers">
      <legend className="eco-subtitle">
        {m.facility_workers_title({ count: facility.workers.length, slots: facility.slots })}
      </legend>
      <p className="eco-footnote">
        {gather ? (
          <>
            {m.facility_workers_rule({
              primary: statName(gather.primary),
              secondary: statName(gather.secondary),
            })}
            {" · "}
            {facility.cityId === null
              ? m.facility_workers_output_building()
              : m.facility_workers_output_city({ city: cityText(facility.cityId) })}
          </>
        ) : (
          m.facility_workers_rule_medical()
        )}
      </p>
      {facility.workers.length === 0 ? (
        <p className="eco-empty">{m.facility_workers_none()}</p>
      ) : (
        <ul className="facility-worker-list">
          {facility.workers.map((worker) => (
            <li key={worker.unitId} className="facility-worker" data-via={worker.via}>
              <span className="facility-worker-name">{workerLine(worker)}</span>
              {worker.commuteUntil === undefined ? null : (
                <span className="facility-worker-commute" data-part="facility-worker-commute">
                  {m.facility_worker_commute()}{" "}
                  <time
                    dateTime={new Date(worker.commuteUntil).toISOString()}
                    title={dateText(worker.commuteUntil)}
                  >
                    {relativeText(worker.commuteUntil, data.generatedAt)}
                  </time>
                </span>
              )}
              {worker.via === "assign" && worker.mine ? (
                <button
                  type="button"
                  className="button-small"
                  disabled={busy}
                  onClick={() => void runLabor({ t: "labor_unassign", unitId: worker.unitId })}
                >
                  {m.facility_worker_unassign()}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {!built ? (
        <p className="eco-footnote">{m.facility_workers_not_built()}</p>
      ) : free.length === 0 ? (
        <p className="eco-footnote">{m.facility_workers_no_free()}</p>
      ) : (
        <div className="labor-inline facility-worker-pick">
          <label className="eco-field facility-worker-field" htmlFor={fieldId}>
            <span>{m.facility_worker_pick()}</span>
            <select
              id={fieldId}
              className="eco-select"
              value={unitId === null ? "" : String(unitId)}
              onChange={(event) => setPicked(Number(event.target.value))}
            >
              {free.map((unit) => (
                <option key={unit.id} value={String(unit.id)}>
                  {unit.cyborg
                    ? m.facility_worker_option_cyborg({ stats: statText(unit) })
                    : m.facility_worker_option({ id: unit.id, stats: statText(unit) })}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button-small"
            disabled={busy || full || unitId === null}
            onClick={() => {
              if (unitId !== null)
                void runLabor({ t: "labor_assign", buildingId: facility.buildingId, unitId });
            }}
          >
            {m.facility_worker_assign()}
          </button>
        </div>
      )}
      {built && elsewhere > 0 ? (
        <p className="eco-footnote">{m.facility_workers_other_map({ count: elsewhere })}</p>
      ) : null}
      {built && full ? <p className="eco-footnote">{m.facility_workers_full()}</p> : null}
      <p className="eco-footnote">{m.facility_workers_note()}</p>
    </fieldset>
  );
}
