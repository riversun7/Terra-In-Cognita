// 건물 칸의 공격 부분 — 칠 수 있는 남의 시설·다른 세력 영토 비콘(질문 381, 기획 D-175·D-5043·336 ③)
// docs/adr/2026-11-07-buildings-runtime.md "바뀜 (전투·건물)". 판정은 서버(facility_attack, 프로토콜 12): 넥서스 = 대상인 공성 전투를 열고,
// 전투가 깎은 내구도만큼 상태가 준다(0%면 폐허 = 기능 정지, 수리로 되돌림). 화면은 목록과 [공격] 단추만.
// - 공격 유닛 = 위 일꾼 고르기에서 고른 유닛 가운데 그 2차맵에 있는 것(서버가 다시 본다: 내 유닛·작업 아님·부상 아님).
// - 바뀜(줄기 no-teleport-a — D-591, 질문 2659): 대상에서 32칸 밖인 고른 유닛은 누르기 전에 "멀어서 못 침"으로 알리고 공격에서 뺀다(모두 멀면 단추를 끈다).
import type { FacilitiesOverviewResponse, FacilityTargetView } from "@terra/shared/facilities";
import { m } from "../paraglide/messages.js";
import { pickName } from "./economyText.ts";
import { ConditionBar } from "./FacilityCards.tsx";
import { type FacilityRun, STATE_TEXT } from "./facilityText.ts";

function targetTitle(target: FacilityTargetView): string {
  return target.kind === "beacon"
    ? m.facility_target_beacon({ id: target.id })
    : m.facility_target_facility({
        name: pickName(target.name ?? undefined, target.facilityId ?? ""),
        id: target.id,
      });
}

function TargetRow({
  target,
  units,
  run,
  busy,
}: {
  target: FacilityTargetView;
  units: readonly number[];
  run: FacilityRun;
  busy: boolean;
}) {
  const titleId = `facility-target-${target.kind}-${target.id}`;
  // 고른 유닛 가운데 그 2차맵에서 대상 근처(32칸 안)에 있는(서버가 공격에 쓸 수 있다고 본) 것
  const attackers = units.filter((id) => target.unitIds.includes(id));
  // 고른 유닛 가운데 같은 2차맵이지만 멀어서 못 치는 것(누르기 전에 알린다 — 줄기 no-teleport-a, 질문 2659)
  const far = units.filter((id) => target.farUnitIds?.includes(id) === true);
  const ruined = target.durability <= 0;
  return (
    <li className="facility-card" data-state={target.state} data-part="facility-target">
      <div className="facility-head">
        <span id={titleId} className="eco-row-title">
          {targetTitle(target)}
        </span>
        <span className="eco-tag" data-state={target.state}>
          {STATE_TEXT[target.state]()}
        </span>
      </div>
      <ConditionBar ppm={target.conditionPpm} label={m.facility_condition_label()} state={target.state} />
      <p className="eco-row-meta">
        {m.facility_target_meta({
          map: target.mapKey,
          durability: target.durability,
          max: target.maxDurability,
        })}
      </p>
      {ruined ? null : (
        <>
          <div className="labor-actions">
            <button
              type="button"
              className="button-small"
              aria-describedby={titleId}
              disabled={busy || attackers.length === 0}
              onClick={() =>
                void run(
                  target.kind === "beacon"
                    ? { t: "facility_attack", beaconId: target.id, unitIds: [...attackers] }
                    : { t: "facility_attack", buildingId: target.id, unitIds: [...attackers] },
                )
              }
            >
              {m.facility_attack({ count: attackers.length })}
            </button>
          </div>
          {far.length > 0 ? (
            <p className="eco-footnote" data-part="facility-target-far">
              {m.facility_attack_far({ units: far.map((id) => `#${id}`).join(", ") })}
            </p>
          ) : null}
          {attackers.length === 0 ? (
            <p className="eco-footnote">
              {far.length > 0 ? m.facility_attack_needs_near() : m.facility_attack_needs_units()}
            </p>
          ) : null}
        </>
      )}
    </li>
  );
}

export function TargetList({
  data,
  units,
  run,
  busy,
}: {
  data: FacilitiesOverviewResponse;
  units: readonly number[];
  run: FacilityRun;
  busy: boolean;
}) {
  return (
    <>
      <h3 className="eco-subtitle">{m.facility_targets_title()}</h3>
      <p className="eco-footnote">{m.facility_targets_note()}</p>
      {data.targets.length === 0 ? (
        <p className="eco-empty">{m.facility_targets_empty()}</p>
      ) : (
        <ul className="labor-contracts">
          {data.targets.map((target) => (
            <TargetRow
              key={`${target.kind}-${target.id}`}
              target={target}
              units={units}
              run={run}
              busy={busy}
            />
          ))}
        </ul>
      )}
    </>
  );
}
