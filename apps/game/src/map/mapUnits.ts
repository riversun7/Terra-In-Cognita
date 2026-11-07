// 2차맵 화면의 내 유닛 목록 자료(tRPC world.mapUnits)와 순수 도우미 — docs/adr/2026-11-07-unit-control.md(사용자 지적 2026-11-07 "유저는 맵 진입시
// 본인의 유닛만 움직일 수 있어야함. 사이보그 포함 유닛 목록을 통해 선택하여 명령. 운영자는 다른 유닛 조종이나 시야 자유이동이 가능").
// - 목록은 서버가 준다(그 2차맵의 내 유닛, 사이보그 본체 먼저, 명령할 수 없는 까닭). 화면은 MAP_UNITS_POLL_MS마다 다시 묻는다.
// - 고른 유닛을 어떻게 다룰지(unitControlOf)는 화면 판단이다: 운영자 모드면 무엇이든, 아니면 내 유닛(목록 또는 시야 전송의 own)만.
//   서버가 명령마다 다시 본다(not_owner·unit_stays). 엔진을 가져오지 않는다(시험 대상, mapUnits.test.ts).
import type { MapUnit, MapUnitHold, MapUnitsResponse } from "@terra/shared/mapUnits";
import type { RosterJob } from "@terra/shared/roster";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { injuryLabel, typeLabel } from "../roster/rosterText.ts";

/** 내 유닛 목록을 다시 묻는 간격(ms). 메모리만 읽는 가벼운 조회다(서버 src/worldMap/mapUnits.ts) */
export const MAP_UNITS_POLL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 10_000;

export function loadMapUnits(mapKey: number, signal?: AbortSignal): Promise<MapUnitsResponse> {
  return api.world.mapUnits.query({ mapKey }, { signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

/** 줄 이름: 사이보그 본체 = "이름 · 내 사이보그"(이름을 모르면 "내 사이보그"), 그 밖 = "종류 #번호"(유닛 이름 칸이 아직 없다) */
export function unitName(unit: Pick<MapUnit, "unitId" | "kind" | "name">): string {
  if (unit.kind === "cyborg_body")
    return unit.name === null ? m.world_my_cyborg() : m.map_unit_cyborg_named({ name: unit.name });
  return m.roster_unnamed({ type: typeLabel(unit.kind), number: String(unit.unitId) });
}

/** 직무 이름(목록 한 줄 — 시설 직무는 시설 ID, 지금 세계에는 시험 직무만 있다) */
function jobName(job: RosterJob): string {
  if (job.kind === "facility") return job.facility;
  return job.kind === "test_gather" ? m.roster_job_test_gather() : m.roster_job_test_hunt();
}

const HOLD_STATUS = {
  guardian: () => m.map_unit_status_stays(),
  captive: () => m.units_status_captive(),
  critical: () => m.roster_injury_3(),
} satisfies Record<MapUnitHold, () => string>;

/**
 * 지금 상태 한 마디: 명령할 수 없는 까닭(머묾·포로·중태) > 이동 중 > 부상 > 직무(일함·쉼) > 대기.
 * moving = 엔진의 지금 값(없으면 조회 때 값)
 */
export function unitStatusText(unit: Pick<MapUnit, "hold" | "injury" | "job">, moving: boolean): string {
  if (unit.hold) return HOLD_STATUS[unit.hold]();
  if (moving) return m.map_unit_state_moving();
  const injury = injuryLabel(unit.injury);
  if (injury) return injury;
  if (unit.job) {
    const phase = unit.job.phase === "rest" ? m.units_status_resting() : m.units_status_working();
    return m.units_job_phase({ job: jobName(unit.job), phase });
  }
  return m.map_unit_status_idle();
}

/** 고른 유닛을 어떻게 다루나: 운영자(무엇이든 명령)·내 유닛(명령)·내 유닛이지만 지금 못 함(까닭)·남의 유닛(정보만) */
export type UnitControl =
  | { readonly kind: "operator" }
  | { readonly kind: "own" }
  | { readonly kind: "hold"; readonly hold: MapUnitHold }
  | { readonly kind: "other" };

/**
 * mine = 목록의 그 줄(없으면 내 유닛 목록에 없음), ownByFeed = 시야 전송이 내 유닛이라고 함(목록을 받기 전·다시 받는 사이).
 * 운영자 모드면 늘 operator(서버가 운영자 권한으로 받는다 — 수호신도 옮긴다)
 */
export function unitControlOf(options: {
  readonly operator: boolean;
  readonly mine: Pick<MapUnit, "hold"> | undefined;
  readonly ownByFeed: boolean;
}): UnitControl {
  if (options.operator) return { kind: "operator" };
  if (options.mine?.hold) return { kind: "hold", hold: options.mine.hold };
  if (options.mine || options.ownByFeed) return { kind: "own" };
  return { kind: "other" };
}

/** 명령을 보낼 수 있는 다룸인가(운영자·내 유닛) */
export const canCommand = (control: UnitControl): boolean =>
  control.kind === "operator" || control.kind === "own";

const HOLD_TEXT = {
  guardian: (unit: string) => m.map_unit_hold_guardian({ unit }),
  captive: (unit: string) => m.map_unit_hold_captive({ unit }),
  critical: (unit: string) => m.map_unit_hold_critical({ unit }),
} satisfies Record<MapUnitHold, (unit: string) => string>;

/** 고른 유닛 안내 한 줄. label = 내 유닛이면 목록 이름, 아니면 "유닛 #번호" */
export function selectionText(control: UnitControl, label: string, unitId: number, moving: boolean): string {
  switch (control.kind) {
    case "operator":
      return m.map_unit_selected_operator({ unit: label });
    case "own":
      return m.map_unit_selected_own({ unit: label });
    case "hold":
      return HOLD_TEXT[control.hold](label);
    case "other":
      return m.map_unit_selected_other({
        id: unitId,
        state: moving ? m.map_unit_state_moving() : m.map_unit_state_standing(),
      });
    default: {
      const unhandled: never = control;
      return unhandled;
    }
  }
}
