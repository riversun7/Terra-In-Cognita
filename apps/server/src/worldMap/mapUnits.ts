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
// - 기획 답 920 라: 경비대 휴먼(거울 세계 SimUnit.guard)은 한눈 정보에 guard 표시(기기가 "경비대"로 적는다).
// - 질문 963 나: 외형 조회(unitLooks)에 내가 보는 유닛(종류와 상관없이)의 나라를 싣는다 — 2차맵 발밑 나라 색 고리. 새 조회를 두지 않고 외형과
//   같은 묻는 때(유닛 목록이 바뀌면·60초마다)·같은 보는 규칙을 쓴다.
// - 2026-11-12(사용자 요청 "유닛 이름이 표시되게 하자", "큰 유닛들은 캐릭터가 없는 문제"): 같은 답에 이름표·몸꼴 자료(labels — 종류·이름)를 싣는다.
//   이름이 있거나 크기 등급 2 이상인 유닛만(전체 보기에서 이름 없는 시험 봇 수천 줄을 싣지 않게). DB를 읽지 않는다.
// 세계 규칙·표는 바꾸지 않는다.
import { type CharacterLook, characterLookForUnit } from "@terra/shared/characterLook";
import type {
  MapUnit,
  MapUnitGlance,
  MapUnitGlanceResponse,
  MapUnitKind,
  MapUnitLabel,
  MapUnitLook,
  MapUnitLooksResponse,
  MapUnitNation,
  MapUnitsResponse,
} from "@terra/shared/mapUnits";
import type { Viewer } from "../trpc/context.ts";
import {
  type Primaries,
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
import { UNIT_KIND_BOAT, UNIT_KIND_BOT, UNIT_KIND_CYBORG, UNIT_KIND_NPC_LEADER } from "../world/unitKinds.ts";

/** 이 조회가 세계에서 읽는 것(시험은 가짜를 넣는다) */
export interface MapUnitSource {
  map(
    mapKey: number,
  ):
    | (Pick<SecondMap, "forEachUnit" | "unitInfo" | "forEachBuilding"> &
        Partial<Pick<SecondMap, "passengers">>)
    | undefined;
  /** 배 하나의 자리 수(설정 칸 boat_capacity, docs/adr/2026-11-13-boats.md). 없으면 배 줄에 자리 수 0 */
  boatCapacity?: (() => number) | undefined;
  /** 배 표시 정보(배 종류 자리 수·내구도·집 정박장 — docs/adr/2026-11-15-shipyard-harbor.md). 없으면 boatCapacity만 */
  boatInfo?: ((unitId: number) => BoatRowInfo | undefined) | undefined;
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
  /** 소유 주체(유저) → 그 유저가 정한 세력 정체성(docs/adr/2026-11-11-faction-identity.md). NPC 주체·정하지 않음이면 null */
  identityOfOwner?: ((ownerId: number) => Promise<MapUnitGlance["owner"]>) | undefined;
  /** 세력 코드 → 그 나라 지도자 이름(팩 국가 프리셋, "WP-NPC"). 없으면 지도자 이름 없음 */
  leaderName?: ((code: string) => MapUnitGlance["name"] | undefined) | undefined;
  /**
   * 그 유닛이 NPC 도시 휴먼(NPC 사회 런타임 거울 세계)이면 이름(기획 답 773 나, 없으면 undefined)을 든 답, 휴먼이 아니면 undefined
   * (docs/adr/2026-11-07-play-flow.md "WP-NPC4"). 없으면 NPC 휴먼도 시험 유닛으로 보인다
   */
  npcHuman?:
    | ((
        unitId: number,
      ) => { readonly name: string | undefined; readonly guard?: boolean | undefined } | undefined)
    | undefined;
  /**
   * 유닛의 1차 스탯(입은 장비·버프 포함, 직무 산출과 같은 값 — holdings primariesOf). 고른 유닛의 추천 줄이 읽는다
   * (docs/adr/2026-11-11-production-six.md). 없으면 스탯을 싣지 않는다
   */
  primaries?: ((unitId: number) => Primaries | undefined) | undefined;
  /**
   * 사이보그 본체 유닛의 3D 외형(저장한 것, 없으면 옛 외형에서 넘긴 값 — docs/adr/2026-11-11-character-3d.md 5절). 본체가 아니거나 자료가
   * 없으면 undefined(그 유닛은 답에 싣지 않는다 — 기기가 기본 외형으로 그린다)
   */
  cyborgLook?: ((unitId: number) => CharacterLook | undefined) | undefined;
  /** 사이보그 본체 유닛 → 사이보그 이름(이름표, 2026-11-12). 본체가 아니거나 모르면 undefined */
  cyborgNameOfUnit?: ((unitId: number) => string | undefined) | undefined;
  /**
   * 소유 주체들 → 나라(세력 행 ID, 없으면 null) 한 번에(질문 963 나 — 건물 깃발과 같은 값, facilities/targets.ts ownerFactionsOf). 없으면 나라 색
   * 고리를 싣지 않는다
   */
  ownerNations?: ((ownerIds: readonly number[]) => Promise<ReadonlyMap<number, number | null>>) | undefined;
}

export interface MapUnitReads {
  mapUnits(viewer: Viewer, mapKey: number, nowMs: number): MapUnitsResponse;
  unitGlance(viewer: Viewer, mapKey: number, unitId: number, nowMs: number): Promise<MapUnitGlanceResponse>;
  /**
   * 그 2차맵에서 내가 보는 사이보그 본체·NPC 지도자의 3D 외형(메모리만 읽는다)과 내가 보는 유닛의 나라(나라 색 고리, 질문 963 나 — 플레이어
   * 주체의 가입 국가만 DB에서 한 번에 읽는다)
   */
  unitLooks(viewer: Viewer, mapKey: number, nowMs: number): Promise<MapUnitLooksResponse>;
}

/** 카메라 범위 여유(배치 칸): 시야 반지름 바깥으로 이만큼 더 본다(안개가 덮는 둘레). [임시] 화면 값 — 판정에 쓰지 않는다 */
export const VIEW_MARGIN_CELLS = 16;
/** 다른 곳 내 유닛 수를 다시 세기까지(ms). 화면은 5초마다 묻지만 모든 2차맵을 훑는 셈이라 주체마다 이만큼 같은 수를 쓴다 */
export const ELSEWHERE_CACHE_MS = 15_000;

/** 세계 유닛 종류 코드 → 목록 종류(사이보그 본체는 따로, 나머지는 유닛 화면과 같은 이름) */
function kindOf(kind: number): MapUnitKind {
  if (kind === UNIT_KIND_CYBORG) return "cyborg_body";
  if (kind === UNIT_KIND_NPC_LEADER) return "npc_leader";
  if (kind === UNIT_KIND_BOAT) return "boat";
  const type = unitTypeOf(kind);
  return type === "creature" || type === "android" ? "test_unit" : type;
}

/** 배 표시 정보(배 서비스 info — 연료·오버히트·표류·함장은 D-559) */
interface BoatRowInfo {
  typeId: string;
  capacity: number;
  hullPm: number;
  homeId: number | null;
  fuelPm?: number | undefined;
  overheat?: boolean | undefined;
  drifting?: boolean | undefined;
  captain?: number | null | undefined;
}

/** 배 줄 칸(정보가 있으면 종류 자리 수·내구도·집 정박장·연료·오버히트·표류·함장) */
function boatRow(
  passengers: readonly number[],
  info: BoatRowInfo | undefined,
  capacity: number,
): NonNullable<MapUnit["boat"]> {
  return info
    ? {
        passengers,
        capacity: info.capacity,
        typeId: info.typeId,
        hullPm: info.hullPm,
        homeId: info.homeId,
        ...(info.fuelPm === undefined ? {} : { fuelPm: info.fuelPm }),
        ...(info.overheat === undefined ? {} : { overheat: info.overheat }),
        ...(info.drifting === undefined ? {} : { drifting: info.drifting }),
        ...(info.captain === undefined ? {} : { captain: info.captain }),
      }
    : { passengers, capacity };
}

/** 판정 스탯 묶음 → 목록 줄의 stats 칸(없으면 칸을 두지 않는다) */
function statsOf(primaries: Primaries | undefined): Pick<MapUnit, "stats"> {
  if (!primaries) return {};
  const { str, vit, int, wis, dex, agi } = primaries;
  return { stats: { str, vit, int, wis, dex, agi } };
}

const clampCell = (value: number): number => Math.max(0, Math.min(PLACEMENT_SIZE - 1, value));

export function createMapUnitReads(source: MapUnitSource): MapUnitReads {
  /** 이름표·몸꼴 한 줄(이름이 없고 크기 등급 1이면 null — 기기가 기본으로 그린다) */
  const labelOf = (unitId: number, kind: number, size: number): MapUnitLabel | null => {
    let name: string | undefined;
    let labelKind = kindOf(kind);
    if (kind === UNIT_KIND_CYBORG) name = source.cyborgNameOfUnit?.(unitId);
    else if (kind === UNIT_KIND_BOT) {
      const human = source.npcHuman?.(unitId);
      if (human) {
        labelKind = "human";
        name = human.name;
      }
    }
    if (name === undefined && size < 2) return null;
    return { unitId, kind: labelKind, name: name === undefined ? null : { ko: name, en: name } };
  };

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
          ...statsOf(source.primaries?.(unitId)),
          // 배(docs/adr/2026-11-13-boats.md): 탄 배, 배 줄의 승객·자리 수
          aboard: info.aboard ?? null,
          ...(info.kind === UNIT_KIND_BOAT
            ? {
                boat: boatRow(
                  map.passengers?.(unitId) ?? [],
                  source.boatInfo?.(unitId),
                  source.boatCapacity?.() ?? 0,
                ),
              }
            : {}),
        });
      }
      // 사이보그 본체 먼저, 그다음 ID 차례
      units.sort(
        (a, b) => Number(b.kind === "cyborg_body") - Number(a.kind === "cyborg_body") || a.unitId - b.unitId,
      );
      return { ...base, loaded: true, units, elsewhere, view };
    },

    async unitLooks(viewer, mapKey, nowMs) {
      const units: MapUnitLook[] = [];
      const map = source.map(mapKey);
      if (!map) return { status: "ready", mapKey, units, nations: [], labels: [], generatedAt: nowMs };
      const ownerId = source.ownerOfUser(viewer.id);
      const all = source.observer?.(viewer) ?? false;
      /** 보는 유닛의 주인(나라 색 고리 — 종류와 상관없이) */
      const owners = new Map<number, number[]>();
      const labels: MapUnitLabel[] = [];
      map.forEachUnit((unit) => {
        // 한눈 정보와 같은 규칙: 내 유닛·전체 보기·지금 시야 안일 때만(시야 밖 유닛이 있는지 새지 않게)
        const visible = all || unit.ownerId === ownerId || (source.sees?.(mapKey, viewer, unit.id) ?? false);
        if (!visible) return;
        const list = owners.get(unit.ownerId);
        if (list) list.push(unit.id);
        else owners.set(unit.ownerId, [unit.id]);
        const label = labelOf(unit.id, unit.kind, unit.size);
        if (label) labels.push(label);
        if (unit.kind === UNIT_KIND_NPC_LEADER) {
          units.push({ unitId: unit.id, kind: "npc_leader", look: characterLookForUnit(unit.id, "leader") });
          return;
        }
        if (unit.kind !== UNIT_KIND_CYBORG) return;
        const look = source.cyborgLook?.(unit.id);
        if (look) units.push({ unitId: unit.id, kind: "cyborg_body", look });
      });
      units.sort((a, b) => a.unitId - b.unitId);
      labels.sort((a, b) => a.unitId - b.unitId);
      const response: MapUnitLooksResponse = { status: "ready", mapKey, units, labels, generatedAt: nowMs };
      if (!source.ownerNations) return response;
      // 주인 → 나라(건물 깃발과 같은 값). 나라마다 유닛 ID를 모은다(유닛마다 나라를 싣는 것보다 짧다)
      const nationOf = await source.ownerNations([...owners.keys()]);
      const byNation = new Map<number, number[]>();
      for (const [owner, ids] of owners) {
        const nation = nationOf.get(owner) ?? null;
        if (nation === null) continue;
        const list = byNation.get(nation);
        if (list) list.push(...ids);
        else byNation.set(nation, [...ids]);
      }
      const nations: MapUnitNation[] = [...byNation]
        .map(([factionId, ids]) => ({ factionId, unitIds: ids.toSorted((a, b) => a - b) }))
        .toSorted((a, b) => a.factionId - b.factionId);
      return { ...response, nations };
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
      // 유저 유닛이면 주인이 정한 세력 정체성(이름·약어·마크). 읽지 못해도 한눈 정보는 그대로 준다
      const owner = (await source.identityOfOwner?.(info.ownerId)?.catch(() => null)) ?? null;
      const ownerPart = owner ? { owner } : {};
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
            ...ownerPart,
            ...(human.name === undefined ? {} : { name: { ko: human.name, en: human.name } }),
            ...(human.guard === true ? { guard: true as const } : {}),
          },
        };
      return {
        ...none,
        glance: {
          unitId,
          kind: kindOf(info.kind),
          faction,
          ...ownerPart,
          ...(leader ? { name: leader } : {}),
        },
      };
    },
  };
}
