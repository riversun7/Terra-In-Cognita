// 2차맵 화면의 내 유닛 목록 자료(tRPC world.mapUnits)와 순수 도우미 — docs/adr/2026-11-07-unit-control.md(사용자 지적 2026-11-07 "유저는 맵 진입시
// 본인의 유닛만 움직일 수 있어야함. 사이보그 포함 유닛 목록을 통해 선택하여 명령. 운영자는 다른 유닛 조종이나 시야 자유이동이 가능").
// - 목록은 서버가 준다(그 2차맵의 내 유닛, 사이보그 본체 먼저, 명령할 수 없는 까닭). 화면은 MAP_UNITS_POLL_MS마다 다시 묻는다.
// - 고른 유닛을 어떻게 다룰지(unitControlOf)는 화면 판단이다: 운영자 모드면 무엇이든, 아니면 내 유닛(목록 또는 시야 전송의 own)만.
//   서버가 명령마다 다시 본다(not_owner·unit_stays). 엔진을 가져오지 않는다(시험 대상, mapUnits.test.ts).
// 바뀜(기획 답 630~637, ADR "바뀜 (기획 답 630~637)"): 목록 차례는 유닛 화면의 손이 필요한 순(637 나, sortMapUnits), 다른 곳 내 유닛 수 한 줄
// (632 다), 남의 유닛을 누르면 시야 안일 때 세력·종류(636 나, world.unitGlance → selectionText).
import type {
  MapUnit,
  MapUnitGlance,
  MapUnitGlanceResponse,
  MapUnitHold,
  MapUnitKind,
  MapUnitsResponse,
} from "@terra/shared/mapUnits";
import type { RosterJob } from "@terra/shared/roster";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { type Locale, getLocale } from "../paraglide/runtime.js";
import {
  type UnitStatus,
  UNIT_STATUSES,
  injuryLabel,
  localName,
  recoveryLeft,
  typeLabel,
} from "../roster/rosterText.ts";

/** 내 유닛 목록을 다시 묻는 간격(ms). 메모리만 읽는 가벼운 조회다(서버 src/worldMap/mapUnits.ts) */
export const MAP_UNITS_POLL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 10_000;

export function loadMapUnits(mapKey: number, signal?: AbortSignal): Promise<MapUnitsResponse> {
  return api.world.mapUnits.query({ mapKey }, { signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

/** 남의 유닛 한눈 정보(636 나). 시야 밖·없는 유닛이면 glance null */
export function loadUnitGlance(
  mapKey: number,
  unitId: number,
  signal: AbortSignal,
): Promise<MapUnitGlanceResponse> {
  return api.world.unitGlance.query({ mapKey, unitId }, { signal });
}

/** 유닛 화면 상태 분류(손이 필요한 순, rosterText.ts unitStatus와 같은 규칙): 포로 → 부상 → 직무 없음 → 쉼 → 일함 */
function attentionOf(unit: Pick<MapUnit, "hold" | "injury" | "job">): UnitStatus {
  if (unit.hold === "captive") return "captive";
  if (unit.injury > 0) return "injured";
  if (unit.job === null) return "idle";
  return unit.job.phase === "rest" ? "resting" : "working";
}

/** 손이 필요한 순 차례 번호 */
const attentionRank = (unit: MapUnit): number => UNIT_STATUSES.indexOf(attentionOf(unit));

/**
 * 목록 차례(637 나): 사이보그 본체 먼저, 그다음 유닛 화면 정렬(rosterText.ts sortUnits)과 같은 규칙 — 손이 필요한 순(포로 → 부상 무거운 순 →
 * 직무 없음 → 쉼 → 일함), 같으면 이름·번호 순
 */
export function sortMapUnits(units: readonly MapUnit[], locale: Locale = getLocale()): MapUnit[] {
  const collator = new Intl.Collator(locale, { numeric: true });
  return units.toSorted(
    (a, b) =>
      Number(b.kind === "cyborg_body") - Number(a.kind === "cyborg_body") ||
      attentionRank(a) - attentionRank(b) ||
      b.injury - a.injury ||
      collator.compare(unitName(a), unitName(b)),
  );
}

/** 종류 이름(남의 사이보그 본체는 "사이보그 본체") */
function kindLabel(kind: MapUnitKind): string {
  if (kind === "cyborg_body") return m.map_unit_kind_cyborg_body();
  // NPC 국가 지도자 사이보그(docs/adr/2026-11-07-play-flow.md "WP-NPC")
  if (kind === "npc_leader") return m.map_unit_kind_npc_leader();
  return typeLabel(kind);
}

/** 한눈 정보의 세력 이름(팩 이름, 없으면 코드, 코드도 없으면 "세력 #ID") */
function factionLabel(faction: NonNullable<MapUnitGlance["faction"]>): string {
  if (faction.name) return localName(faction.name, String(faction.id));
  return faction.code ?? m.map_unit_faction_number({ id: faction.id });
}

/** 줄 이름: 사이보그 본체 = "이름 · 내 사이보그"(이름을 모르면 "내 사이보그"), 그 밖 = "종류 #번호"(유닛 이름 칸이 아직 없다) */
export function unitName(unit: Pick<MapUnit, "unitId" | "kind" | "name">): string {
  if (unit.kind === "cyborg_body")
    return unit.name === null ? m.world_my_cyborg() : m.map_unit_cyborg_named({ name: unit.name });
  return m.roster_unnamed({ type: kindLabel(unit.kind), number: String(unit.unitId) });
}

/**
 * 화면에 쓰는 유닛 이름 하나(사용자 지적 2026-11-09 문제3 — 아래 안내 줄과 건물 판 "보낼 유닛"이 같은 이름을 쓴다): 이 2차맵 내 유닛 목록에
 * 있으면 줄 이름(unitName — 사이보그 본체 = "이름 · 내 사이보그"), 없으면 "유닛 #번호"
 */
export function unitLabel(unitId: number, units: readonly MapUnit[] | null): string {
  const mine = units?.find((unit) => unit.unitId === unitId);
  return mine ? unitName(mine) : m.map_unit_number({ id: unitId });
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

/** 부상 이름 + 한 단계 나을 때까지 남은 "N시간 M분"(D-525). 시각을 모르면 이름만 */
function injuryWithTime(
  unit: Pick<MapUnit, "injury" | "injuryUntilMs">,
  now: number | undefined,
): string | null {
  const injury = injuryLabel(unit.injury);
  if (!injury) return null;
  const left =
    now === undefined || unit.injuryUntilMs === null || unit.injuryUntilMs === undefined
      ? null
      : recoveryLeft(unit.injuryUntilMs, now);
  return left ? m.roster_injury_heal({ stage: injury, time: left }) : injury;
}

/**
 * 지금 상태 한 마디: 명령할 수 없는 까닭(머묾·포로·중태) > 이동 중 > 부상 > 직무(일함·쉼) > 대기.
 * moving = 엔진의 지금 값(없으면 조회 때 값). now = 목록 조회 시각(부상 남은 시간, 없으면 이름만)
 */
export function unitStatusText(
  unit: Pick<MapUnit, "hold" | "injury" | "job" | "injuryUntilMs">,
  moving: boolean,
  now?: number,
): string {
  if (unit.hold === "critical") return injuryWithTime({ ...unit, injury: 3 }, now) ?? HOLD_STATUS.critical();
  if (unit.hold) return HOLD_STATUS[unit.hold]();
  if (moving) return m.map_unit_state_moving();
  const injury = injuryWithTime(unit, now);
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

/**
 * 고른 유닛 안내 한 줄. label = 내 유닛이면 목록 이름, 아니면 "유닛 #번호". glance = 남의 유닛 한눈 정보(시야 안이면 세력·종류, 636 나 —
 * 아직 받지 않았거나 시야 밖이면 null: 번호·움직임만)
 */
export function selectionText(
  control: UnitControl,
  label: string,
  unitId: number,
  moving: boolean,
  glance: MapUnitGlance | null = null,
): string {
  switch (control.kind) {
    case "operator":
      return m.map_unit_selected_operator({ unit: label });
    case "own":
      return m.map_unit_selected_own({ unit: label });
    case "hold":
      return HOLD_TEXT[control.hold](label);
    case "other": {
      const state = moving ? m.map_unit_state_moving() : m.map_unit_state_standing();
      if (glance === null) return m.map_unit_selected_other({ id: unitId, state });
      // 이름이 있는 유닛(NPC 국가 지도자)은 "지도자 이름", 아니면 "종류 #번호"
      const unit = glance.name
        ? m.map_unit_named({ type: kindLabel(glance.kind), name: localName(glance.name, String(unitId)) })
        : m.roster_unnamed({ type: kindLabel(glance.kind), number: String(unitId) });
      return glance.faction
        ? m.map_unit_selected_glance({ faction: factionLabel(glance.faction), unit, state })
        : m.map_unit_selected_glance_free({ unit, state });
    }
    default: {
      const unhandled: never = control;
      return unhandled;
    }
  }
}

/**
 * 남의 유닛 정보 판 글(docs/adr/2026-11-07-unit-control.md "바뀜 (2026-11-09)"): 이름(지도자 이름·"종류 #번호", 한눈 정보가 없으면 "유닛 #번호"),
 * 주인·움직임 한 줄(세력 이름 또는 무소속 · 이동 중/서 있음 — 한눈 정보가 없으면 움직임만)
 */
export function peekText(
  unitId: number,
  moving: boolean,
  glance: MapUnitGlance | null,
): { readonly unit: string; readonly line: string } {
  const state = moving ? m.map_unit_state_moving() : m.map_unit_state_standing();
  if (glance === null) return { unit: m.map_unit_number({ id: unitId }), line: state };
  const unit = glance.name
    ? m.map_unit_named({ type: kindLabel(glance.kind), name: localName(glance.name, String(unitId)) })
    : m.roster_unnamed({ type: kindLabel(glance.kind), number: String(unitId) });
  const owner = glance.faction ? factionLabel(glance.faction) : m.map_peek_free();
  return { unit, line: m.map_peek_line({ owner, state }) };
}

/** 다른 곳 내 유닛 수 한 줄(632 다). 0이면 null(줄을 그리지 않는다) */
export function elsewhereText(count: number): string | null {
  return count > 0 ? m.map_units_elsewhere({ count }) : null;
}
