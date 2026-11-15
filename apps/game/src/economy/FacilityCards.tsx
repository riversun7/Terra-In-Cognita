// 건물 칸의 카드 — 내 시설(상태 막대·작업·레벨업·수리·채집 시설 일꾼 칸), 내 세력 영토 비콘(수리), 고칠 장비(공방 장비 수리)
// docs/adr/2026-11-07-buildings-runtime.md. 판정은 서버, 화면은 미리 셈(@terra/shared/facilityRuntime 같은 식)과 결과 문구만.
// 채집 시설 일꾼 칸(직무 배치)은 WorkerParts.tsx(docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산"), 채집소 칸(버프·원자재·채집소 창고)은
// StationParts.tsx(사용자 지적 2026-11-08 "원자재채집소의 기능도 필요").
import type {
  FacilitiesOverviewResponse,
  FacilityBeaconView,
  FacilityHoldingView,
  FacilityJobView,
  FacilityView,
} from "@terra/shared/facilities";
import {
  conditionStateOf,
  equipmentRepairMs,
  repairMaterialsFor,
  repairRestorePpm,
  repairTimeMs,
} from "@terra/shared/facilityRuntime";
import { useState } from "react";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { formatAmount } from "./amount.ts";
import { formatDuration, pickName } from "./economyText.ts";
import {
  type FacilityRun,
  JOB_TEXT,
  STATE_TEXT,
  beaconStock,
  canAfford,
  cutTime,
  percentOf,
  stacksText,
  stockAt,
} from "./facilityText.ts";
import type { LaborRun } from "./laborText.ts";
import { StationSummary } from "./StationParts.tsx";
import { StorageMoveForm } from "./StorageParts.tsx";
import { FacilityWorkers } from "./WorkerParts.tsx";

/** 상태 막대(색만으로 알리지 않는다: 글로 %, 카드 머리에 상태 이름). 상태(N50 문턱)에 따라 색이 바뀐다 */
export function ConditionBar({ ppm, label, state }: { ppm: number; label: string; state: string }) {
  const pct = percentOf(ppm);
  return (
    <div className="facility-meter-row">
      <div
        className="facility-meter"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%`}
        data-state={state}
      >
        <span className="facility-meter-fill" style={{ inlineSize: `${pct}%` }} />
      </div>
      <span className="facility-meter-text eco-num">{pct}%</span>
    </div>
  );
}

function JobLine({ job, now }: { job: FacilityJobView; now: number }) {
  const left = Math.max(0, job.doneAtMs - now);
  return (
    <p className="facility-job" data-part="facility-job">
      {m.facility_job_line({ job: JOB_TEXT[job.kind](), left: formatDuration(left) })}
    </p>
  );
}

export interface CardProps {
  readonly data: FacilitiesOverviewResponse;
  readonly units: readonly number[];
  readonly now: number;
  readonly run: FacilityRun;
  readonly busy: boolean;
  /** 직무 배치 명령(노동 계약 길, 프로토콜 14). 없으면 일꾼 칸을 그리지 않는다 */
  readonly runLabor?: LaborRun | undefined;
}

/** 수리 단계 미리 셈(서버와 같은 식): steps번 이어서, 모자란 만큼까지 */
function repairPlan(
  data: FacilitiesOverviewResponse,
  ppm: number,
  steps: number,
  cost: { readonly materials: readonly { item: string; qty: number }[]; readonly timeMs: number } | undefined,
  units: number,
) {
  const restore = repairRestorePpm(ppm, steps, data.rules);
  return {
    restore,
    materials: cost ? repairMaterialsFor(cost.materials, restore) : [],
    timeMs: cost ? repairTimeMs(cost.timeMs, restore, units, data.rules) : 0,
  };
}

export function FacilityCard({
  facility,
  data,
  units,
  now,
  run,
  busy,
  runLabor,
}: CardProps & { facility: FacilityView }) {
  const titleId = `facility-${facility.buildingId}`;
  const level = Math.max(1, facility.level);
  const cost = data.catalog.find((entry) => entry.id === facility.facilityId)?.levels[level - 1];
  const one = repairPlan(data, facility.conditionPpm, 1, cost, units.length);
  const full = repairPlan(data, facility.conditionPpm, 10, cost, units.length);
  const idle = facility.job === null && facility.level >= 1;
  // 재료 자리: 이 건물이 선 도시 창고 + 그 도시의 내 창고 시설 + 이 2차맵 내 유닛 화물(D-516 361)
  const stock = stockAt(data, facility.mapKey, facility.cityId);
  return (
    <li
      className="facility-card"
      data-state={facility.state}
      data-part="facility-card"
      data-facility={facility.facilityId}
    >
      <div className="facility-head">
        <span id={titleId} className="eco-row-title">
          {m.facility_card_title({
            name: pickName(facility.name, facility.facilityId),
            level: facility.level,
          })}
        </span>
        <span className="eco-tag" data-state={facility.state}>
          {facility.level < 1 ? m.facility_state_building() : STATE_TEXT[facility.state]()}
        </span>
      </div>
      <ConditionBar ppm={facility.conditionPpm} label={m.facility_condition_label()} state={facility.state} />
      <p className="eco-row-meta">
        {m.facility_card_meta({
          durability: facility.durability,
          max: facility.maxDurability,
          x: facility.x,
          y: facility.y,
        })}
        {facility.storageKg === null
          ? ""
          : facility.storedKg !== null
            ? ` · ${m.facility_storage_used({ used: facility.storedKg, kg: facility.storageKg })}`
            : ` · ${m.facility_storage({ kg: facility.storageKg })}`}
        {facility.lodging
          ? ` · ${
              facility.lodging.occupants === null
                ? m.facility_lodging_beds({ beds: facility.lodging.beds })
                : m.facility_lodging_use({ used: facility.lodging.occupants, beds: facility.lodging.beds })
            }`
          : ""}
      </p>
      {facility.idleMsToDisabled !== null && facility.works ? (
        <p className="eco-footnote">
          {m.facility_idle_left({ left: formatDuration(facility.idleMsToDisabled) })}
        </p>
      ) : null}
      {facility.job ? <JobLine job={facility.job} now={now} /> : null}
      <div className="labor-actions">
        {idle && facility.upgrade ? (
          <button
            type="button"
            className="button-small"
            aria-describedby={titleId}
            disabled={busy || !canAfford(stock, facility.upgrade.materials)}
            title={stacksText(data, stock, facility.upgrade.materials)}
            onClick={() =>
              void run({ t: "facility_upgrade", buildingId: facility.buildingId, unitIds: [...units] })
            }
          >
            {m.facility_upgrade({
              level: facility.level + 1,
              time: formatDuration(cutTime(facility.upgrade.timeMs, units.length, data)),
            })}
          </button>
        ) : null}
        {idle && one.restore > 0 ? (
          <>
            <button
              type="button"
              className="button-small"
              aria-describedby={titleId}
              disabled={busy || units.length === 0 || !canAfford(stock, one.materials)}
              onClick={() =>
                void run({
                  t: "facility_repair",
                  buildingId: facility.buildingId,
                  steps: 1,
                  unitIds: [...units],
                })
              }
            >
              {m.facility_repair_step({ pct: Math.ceil(one.restore / 10_000) })}
            </button>
            <button
              type="button"
              className="button-small"
              aria-describedby={titleId}
              disabled={busy || units.length === 0 || !canAfford(stock, full.materials)}
              onClick={() =>
                void run({
                  t: "facility_repair",
                  buildingId: facility.buildingId,
                  steps: 10,
                  unitIds: [...units],
                })
              }
            >
              {m.facility_repair_full({ time: formatDuration(full.timeMs) })}
            </button>
          </>
        ) : null}
        {data.dev && facility.job ? (
          <button
            type="button"
            className="button-small"
            aria-describedby={titleId}
            disabled={busy}
            onClick={() => void run({ t: "dev_facility_finish", buildingId: facility.buildingId })}
          >
            {m.facility_dev_finish()}
          </button>
        ) : null}
      </div>
      {idle && one.restore > 0 ? (
        <p className="eco-footnote">
          {units.length === 0
            ? m.facility_repair_needs_units()
            : m.facility_repair_cost({ materials: stacksText(data, stock, full.materials) })}
        </p>
      ) : null}
      {idle && facility.upgrade ? (
        <p className="eco-footnote">
          {m.facility_upgrade_cost({ materials: stacksText(data, stock, facility.upgrade.materials) })}
        </p>
      ) : null}
      {facility.storage && facility.level >= 1 ? (
        <StorageMoveForm facility={facility} data={data} run={run} busy={busy} />
      ) : null}
      {facility.gather && facility.level >= 1 ? (
        <StationSummary facility={facility} run={run} busy={busy} />
      ) : null}
      {/* 채집 시설 = 일꾼, 병원 = 의사(D-521 — 같은 직무 배치 칸, 산출 없음) */}
      {(facility.gather || facility.medical) && runLabor ? (
        <FacilityWorkers facility={facility} data={data} runLabor={runLabor} busy={busy} />
      ) : null}
    </li>
  );
}

export function BeaconCard({
  beacon,
  data,
  units,
  now,
  run,
  busy,
}: CardProps & { beacon: FacilityBeaconView }) {
  const titleId = `facility-beacon-${beacon.id}`;
  // 비콘 수리 재료·시간 = 레벨 1 건설 재료·시간 × 고친 비율(건물 규칙, 기획 336)
  const cost = data.catalog.find((entry) => entry.id === "territory_beacon")?.levels[0];
  const plan = repairPlan(data, beacon.conditionPpm, 10, cost, units.length);
  const ready = beacon.readyAtMs === null;
  // 재료 자리(질문 410 ①): 그 세력에서 비콘 칸과 가장 가까운 도시의 내 도시 창고 + 그 도시의 내 창고 시설(화물 없음)
  const stock = beaconStock(data, beacon.supplyCityId);
  return (
    <li className="facility-card" data-state={beacon.state} data-part="facility-beacon">
      <div className="facility-head">
        <span id={titleId} className="eco-row-title">
          {m.facility_beacon_title({ id: beacon.id })}
        </span>
        <span className="eco-tag" data-state={beacon.state}>
          {ready
            ? STATE_TEXT[conditionStateOf(beacon.conditionPpm, data.rules)]()
            : m.facility_state_building()}
        </span>
      </div>
      <ConditionBar ppm={beacon.conditionPpm} label={m.facility_condition_label()} state={beacon.state} />
      <p className="eco-row-meta">
        {m.facility_beacon_meta({ durability: beacon.durability, max: beacon.maxDurability })}
        {beacon.readyAtMs === null
          ? ""
          : ` · ${m.facility_ready_in({ left: formatDuration(beacon.readyAtMs - now) })}`}
      </p>
      {beacon.job ? <JobLine job={beacon.job} now={now} /> : null}
      {ready && !beacon.job && plan.restore > 0 ? (
        <>
          <div className="labor-actions">
            <button
              type="button"
              className="button-small"
              aria-describedby={titleId}
              disabled={busy || units.length === 0 || !canAfford(stock, plan.materials)}
              onClick={() =>
                void run({ t: "facility_repair", beaconId: beacon.id, steps: 10, unitIds: [...units] })
              }
            >
              {m.facility_repair_full({ time: formatDuration(plan.timeMs) })}
            </button>
          </div>
          <p className="eco-footnote">
            {units.length === 0
              ? m.facility_repair_needs_units()
              : m.facility_repair_cost({ materials: stacksText(data, stock, plan.materials) })}
          </p>
          <p className="eco-footnote" data-part="facility-beacon-source">
            {beacon.supplyCityId === null
              ? m.facility_beacon_no_city()
              : m.facility_beacon_city({ id: beacon.supplyCityId })}
          </p>
        </>
      ) : null}
      {data.dev && (beacon.job || !ready) ? (
        <div className="labor-actions">
          <button
            type="button"
            className="button-small"
            aria-describedby={titleId}
            disabled={busy}
            onClick={() => void run({ t: "dev_facility_finish", beaconId: beacon.id })}
          >
            {m.facility_dev_finish()}
          </button>
        </div>
      ) : null}
    </li>
  );
}

export function HoldingRepairRow({
  holding,
  data,
  units,
  run,
  busy,
}: Omit<CardProps, "now"> & { holding: FacilityHoldingView }) {
  const [shop, setShop] = useState("");
  const chosen = holding.shops.find((entry) => String(entry.buildingId) === shop) ?? holding.shops[0];
  const titleId = `facility-holding-${holding.id}`;
  const scores = data.units.filter((unit) => units.includes(unit.id)).map((unit) => unit.craftScore);
  const avg = scores.length === 0 ? 0 : scores.reduce((total, score) => total + score, 0) / scores.length;
  const ms = equipmentRepairMs(
    {
      tier: holding.tier,
      lost: holding.maxDurability - holding.durability,
      maxDurability: holding.maxDurability,
      avgScore: avg,
      units: Math.max(1, units.length),
    },
    data.rules,
  );
  const blocked = holding.busy || holding.equipped || !chosen || units.length === 0;
  const shopView = chosen
    ? data.facilities.find((entry) => entry.buildingId === chosen.buildingId)
    : undefined;
  // 남의 공방(외주, D-564 1682)은 그 자리의 내 재료로 미리 센다
  const stock: ReadonlyMap<string, bigint> = shopView
    ? stockAt(data, shopView.mapKey, shopView.cityId)
    : chosen?.mapKey !== undefined
      ? stockAt(data, chosen.mapKey, chosen.cityId ?? null)
      : new Map();
  return (
    <li className="eco-row facility-holding" data-part="facility-holding">
      <div className="eco-row-main">
        <span id={titleId} className="eco-row-title">
          {pickName(holding.name ?? undefined, holding.item)}
        </span>
        <span className="eco-row-meta">
          {m.facility_holding_meta({
            durability: holding.durability,
            max: holding.maxDurability,
            tier: holding.tier,
          })}
          {holding.busy
            ? ` · ${m.facility_holding_busy()}`
            : holding.equipped
              ? ` · ${m.facility_holding_equipped()}`
              : ""}
        </span>
        {chosen ? (
          <span className="eco-row-meta">
            {m.facility_repair_cost({ materials: stacksText(data, stock, chosen.materials) })}
            {chosen.fee === undefined
              ? ""
              : ` · ${m.facility_outsource_fee({ fee: formatAmount(chosen.fee, getLocale()) })}`}
          </span>
        ) : (
          <span className="eco-row-meta">{m.facility_holding_no_shop()}</span>
        )}
      </div>
      {holding.shops.length > 1 ? (
        <select
          className="eco-select"
          aria-label={m.facility_field_shop()}
          value={chosen ? String(chosen.buildingId) : ""}
          onChange={(event) => setShop(event.target.value)}
        >
          {holding.shops.map((entry) => (
            <option key={entry.buildingId} value={String(entry.buildingId)}>
              {entry.fee === undefined
                ? m.facility_option_building({ id: entry.buildingId })
                : m.facility_option_outsource({
                    id: entry.buildingId,
                    fee: formatAmount(entry.fee, getLocale()),
                  })}
            </option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        className="button-small"
        aria-describedby={titleId}
        disabled={busy || blocked || (chosen !== undefined && !canAfford(stock, chosen.materials))}
        onClick={() => {
          if (chosen)
            void run({
              t: "equipment_repair",
              buildingId: chosen.buildingId,
              holdingId: holding.id,
              unitIds: [...units],
            });
        }}
      >
        {m.facility_equipment_repair({ time: formatDuration(ms) })}
      </button>
    </li>
  );
}
