// 2차맵 화면의 내 유닛 목록(서버, 읽기만) — tRPC world.mapUnits·world.unitGlance. docs/adr/2026-11-07-unit-control.md(사용자 지적 2026-11-07 "사이보그
// 포함 유닛 목록을 통해 선택하여 명령").
// - 그 2차맵(띄운 맵)의 메모리 유닛에서 내 소유 주체의 것만 고른다. DB를 읽지 않는다(목록을 자주 다시 묻는다 — 2차맵 화면 5초마다).
// - 줄마다 지금 명령할 수 없는 까닭(hold)은 명령 판정과 같은 함수(world/unitControl.ts)다. 운영자(dev·admin)도 목록은 내 유닛만 —
//   남의 유닛은 지도에서 눌러 고른다(전체 유닛 목록은 수천이 될 수 있다).
// - 직무는 정산 전 메모리 값이다(사이보그 화면처럼 정산하지 않는다 — 목록 표시용).
// 바뀜(기획 답 630~637, ADR "바뀜 (기획 답 630~637)"):
// - 632 다: 이 2차맵 밖의 내 유닛 수(elsewhere — 다른 띄운 2차맵 + 건너뛰는 중). 모든 2차맵을 훑으므로 주체마다 ELSEWHERE_CACHE_MS 동안 같은 수를 쓴다.
// - 630: 플레이어 카메라 범위(view) — 시야 반지름(서버 판정 칸, @terra/sim) + 여유 VIEW_MARGIN_CELLS, 내 건물 기준 칸.
// - 636 나: 남의 유닛 한눈 정보(glance) — 지금 내 시야 안(시야 전송과 같은 규칙, MapVision.sees)이거나 전체 보기 권한일 때만 세력·종류.
//   시야 밖·없는 유닛은 같은 답(null).
// - "WP-NPC4"(기획 답 773 나): NPC 도시 휴먼은 종류 "휴먼" + 휴먼 이름(그 나라 팩 목록, npc/humanNames.ts).
// 세계 규칙·표는 바꾸지 않는다.
import { type CharacterLook, characterLookForUnit } from "@terra/shared/characterLook";
import type {
  MapUnit,
  MapUnitGlance,
  MapUnitGlanceResponse,
  MapUnitKind,
  MapUnitLook,
  MapUnitLooksResponse,
  MapUnitsResponse,
} from "@terra/shared/mapUnits";
import type { Viewer } from "../trpc/context.ts";
import {
  BUILDING_VISION_CELLS,
  CELL_UNITS,
  PLACEMENT_SIZE,
  UNIT_VISION_CELLS,
  arrivalAt,
  positionAt,
} from "@terra/sim";
import { injuryOf, jobOf, unitTypeOf } from "../roster/worldUnits.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { canCommandAnyUnit, unitHold } from "../world/unitControl.ts";
import { UNIT_KIND_BOT, UNIT_KIND_CYBORG, UNIT_KIND_NPC_LEADER } from "../world/unitKinds.ts";

/** 이 조회가 세계에서 읽는 것(시험은 가짜를 넣는다) */
export interface MapUnitSource {
  map(mapKey: number): Pick<SecondMap, "forEachUnit" | "unitInfo" | "forEachBuilding"> | undefined;
  /** 사용자의 소유 주체(없으면 내 유닛 없음) */
  ownerOfUser(userId: string): number | undefined;
  /** 사이보그 이름(없으면 undefined) */
  cyborgName(userId: string): string | undefined;
  /** 띄운 모든 2차맵(다른 곳 내 유닛 수). 없으면 0 */
  maps?: (() => Iterable<Pick<SecondMap, "mapKey" | "forEachUnit">>) | undefined;
  /** 띄우지 않은 2차맵을 건너뛰는 중인 내 유닛 수(이동 서비스). 없으면 0 */
  hiddenUnits?: ((userId: string) => number) | undefined;
  /** 그 사람이 지금 그 유닛을 보는가(MapVision.sees). 없으면 내 유닛만 본다 */
  sees?: ((mapKey: number, viewer: Viewer, unitId: number) => boolean) | undefined;
  /** 전체 보기 권한(dev·admin — 시야로 거르지 않는다) */
  observer?: ((viewer: Viewer) => boolean) | undefined;
  /** 소유 주체 → 세력 정보(NPC 주체는 세력, 유저 주체는 가입한 국가). 없으면 null */
  factionOfOwner?: ((ownerId: number) => Promise<MapUnitGlance["faction"]>) | undefined;
  /** 세력 코드 → 그 나라 지도자 이름(팩 국가 프리셋, "WP-NPC"). 없으면 지도자 이름 없음 */
  leaderName?: ((code: string) => MapUnitGlance["name"] | undefined) | undefined;
  /**
   * 그 유닛이 NPC 도시 휴먼(NPC 사회 런타임 거울 세계)이면 이름(기획 답 773 나, 없으면 undefined)을 든 답, 휴먼이 아니면 undefined
   * (docs/adr/2026-11-07-play-flow.md "WP-NPC4"). 없으면 NPC 휴먼도 시험 유닛으로 보인다
   */
  npcHuman?: ((unitId: number) => { readonly name: string | undefined } | undefined) | undefined;
  /**
   * 사이보그 본체 유닛의 3D 외형(저장한 것, 없으면 옛 외형에서 넘긴 값 — docs/adr/2026-11-11-character-3d.md 5절). 본체가 아니거나 자료가
   * 없으면 undefined(그 유닛은 답에 싣지 않는다 — 기기가 기본 외형으로 그린다)
   */
  cyborgLook?: ((unitId: number) => CharacterLook | undefined) | undefined;
}

export interface MapUnitReads {
  mapUnits(viewer: Viewer, mapKey: number, nowMs: number): MapUnitsResponse;
  unitGlance(viewer: Viewer, mapKey: number, unitId: number, nowMs: number): Promise<MapUnitGlanceResponse>;
  /** 그 2차맵에서 내가 보는 사이보그 본체·NPC 지도자의 3D 외형(메모리만 읽는다) */
  unitLooks(viewer: Viewer, mapKey: number, nowMs: number): MapUnitLooksResponse;
}

/** 카메라 범위 여유(배치 칸): 시야 반지름 바깥으로 이만큼 더 본다(안개가 덮는 둘레). [임시] 화면 값 — 판정에 쓰지 않는다 */
export const VIEW_MARGIN_CELLS = 16;
/** 다른 곳 내 유닛 수를 다시 세기까지(ms). 화면은 5초마다 묻지만 모든 2차맵을 훑는 셈이라 주체마다 이만큼 같은 수를 쓴다 */
export const ELSEWHERE_CACHE_MS = 15_000;

/** 세계 유닛 종류 코드 → 목록 종류(사이보그 본체는 따로, 나머지는 유닛 화면과 같은 이름) */
function kindOf(kind: number): MapUnitKind {
  if (kind === UNIT_KIND_CYBORG) return "cyborg_body";
  if (kind === UNIT_KIND_NPC_LEADER) return "npc_leader";
  const type = unitTypeOf(kind);
  return type === "creature" || type === "android" ? "test_unit" : type;
}

const clampCell = (value: number): number => Math.max(0, Math.min(PLACEMENT_SIZE - 1, value));

export function createMapUnitReads(source: MapUnitSource): MapUnitReads {
  const elsewhereCache = new Map<number, { readonly atMs: number; readonly mapKey: number; count: number }>();

  /** 이 2차맵 밖의 내 유닛 수(띄운 다른 2차맵 + 건너뛰는 중) */
  const elsewhereOf = (userId: string, ownerId: number, mapKey: number, nowMs: number): number => {
    const cached = elsewhereCache.get(ownerId);
    if (cached && cached.mapKey === mapKey && nowMs - cached.atMs < ELSEWHERE_CACHE_MS) return cached.count;
    let count = source.hiddenUnits?.(userId) ?? 0;
    for (const other of source.maps?.() ?? []) {
      if (other.mapKey === mapKey) continue;
      other.forEachUnit((unit) => {
        if (unit.ownerId === ownerId) count += 1;
      });
    }
    elsewhereCache.set(ownerId, { atMs: nowMs, mapKey, count });
    return count;
  };

  return {
    mapUnits(viewer, mapKey, nowMs) {
      const operator = canCommandAnyUnit(viewer.roles);
      const map = source.map(mapKey);
      const ownerId = source.ownerOfUser(viewer.id);
      const view = {
        unitRadius: UNIT_VISION_CELLS + VIEW_MARGIN_CELLS,
        buildingRadius: BUILDING_VISION_CELLS + VIEW_MARGIN_CELLS,
        buildings: [] as { x: number; y: number }[],
      };
      const base = { status: "ready", mapKey, operator, generatedAt: nowMs } as const;
      const elsewhere = ownerId === undefined ? 0 : elsewhereOf(viewer.id, ownerId, mapKey, nowMs);
      if (!map) return { ...base, loaded: false, units: [], elsewhere, view };
      if (ownerId === undefined) return { ...base, loaded: true, units: [], elsewhere, view };
      const mine: number[] = [];
      map.forEachUnit((unit) => {
        if (unit.ownerId === ownerId) mine.push(unit.id);
      });
      map.forEachBuilding((building) => {
        if (building.ownerId === ownerId) view.buildings.push({ x: building.x, y: building.y });
      });
      const units: MapUnit[] = [];
      for (const unitId of mine) {
        const info = map.unitInfo(unitId);
        if (!info) continue;
        const at = positionAt(info.motion, nowMs);
        const kind = kindOf(info.kind);
        // 부상: 지금 단계와 한 단계 나을 시각(유닛 화면과 같은 셈, D-525 남은 시간 표시)
        const injury = injuryOf(
          info.condition.injury,
          info.condition.injuryUntilMs,
          nowMs,
          info.condition.injuryHealPm,
        );
        units.push({
          unitId,
          kind,
          name: kind === "cyborg_body" ? (source.cyborgName(viewer.id) ?? null) : null,
          cellX: clampCell(Math.floor(at.x / CELL_UNITS)),
          cellY: clampCell(Math.floor(at.y / CELL_UNITS)),
          moving: nowMs < arrivalAt(info.motion),
          job: jobOf(info.job.job, info.job.phase),
          injury: injury.stage,
          injuryUntilMs: injury.untilMs,
          hold: unitHold(info, nowMs),
        });
      }
      // 사이보그 본체 먼저, 그다음 ID 차례
      units.sort(
        (a, b) => Number(b.kind === "cyborg_body") - Number(a.kind === "cyborg_body") || a.unitId - b.unitId,
      );
      return { ...base, loaded: true, units, elsewhere, view };
    },

    unitLooks(viewer, mapKey, nowMs) {
      const units: MapUnitLook[] = [];
      const map = source.map(mapKey);
      if (map) {
        const ownerId = source.ownerOfUser(viewer.id);
        const all = source.observer?.(viewer) ?? false;
        map.forEachUnit((unit) => {
          if (unit.kind !== UNIT_KIND_CYBORG && unit.kind !== UNIT_KIND_NPC_LEADER) return;
          // 한눈 정보와 같은 규칙: 내 유닛·전체 보기·지금 시야 안일 때만(시야 밖 유닛이 있는지 새지 않게)
          const visible =
            all || unit.ownerId === ownerId || (source.sees?.(mapKey, viewer, unit.id) ?? false);
          if (!visible) return;
          if (unit.kind === UNIT_KIND_NPC_LEADER) {
            units.push({
              unitId: unit.id,
              kind: "npc_leader",
              look: characterLookForUnit(unit.id, "leader"),
            });
            return;
          }
          const look = source.cyborgLook?.(unit.id);
          if (look) units.push({ unitId: unit.id, kind: "cyborg_body", look });
        });
        units.sort((a, b) => a.unitId - b.unitId);
      }
      return { status: "ready", mapKey, units, generatedAt: nowMs };
    },

    async unitGlance(viewer, mapKey, unitId, nowMs) {
      const none: MapUnitGlanceResponse = { status: "ready", glance: null, generatedAt: nowMs };
      const info = source.map(mapKey)?.unitInfo(unitId);
      if (!info) return none;
      const ownerId = source.ownerOfUser(viewer.id);
      const visible =
        info.ownerId === ownerId ||
        (source.observer?.(viewer) ?? false) ||
        (source.sees?.(mapKey, viewer, unitId) ?? false);
      if (!visible) return none;
      const faction = (await source.factionOfOwner?.(info.ownerId)) ?? null;
      // NPC 국가 지도자는 그 나라 지도자 이름(WP-NPC)
      const leader =
        info.kind === UNIT_KIND_NPC_LEADER && faction?.code
          ? (source.leaderName?.(faction.code) ?? null)
          : null;
      // NPC 도시 휴먼(봇 유닛 가운데 거울 세계 휴먼)은 종류 "휴먼" + 이름(773 나 — 번역 안 함, 두 언어 같은 글자)
      const human = info.kind === UNIT_KIND_BOT ? source.npcHuman?.(unitId) : undefined;
      if (human)
        return {
          ...none,
          glance: {
            unitId,
            kind: "human",
            faction,
            ...(human.name === undefined ? {} : { name: { ko: human.name, en: human.name } }),
          },
        };
      return {
        ...none,
        glance: { unitId, kind: kindOf(info.kind), faction, ...(leader ? { name: leader } : {}) },
      };
    },
  };
}
