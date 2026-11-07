// 2차맵 화면의 내 유닛 목록(서버, 읽기만) — tRPC world.mapUnits. docs/adr/2026-11-07-unit-control.md(사용자 지적 2026-11-07 "사이보그 포함 유닛 목록을
// 통해 선택하여 명령").
// - 그 2차맵(띄운 맵)의 메모리 유닛에서 내 소유 주체의 것만 고른다. DB를 읽지 않는다(목록을 자주 다시 묻는다 — 2차맵 화면 5초마다).
// - 줄마다 지금 명령할 수 없는 까닭(hold)은 명령 판정과 같은 함수(world/unitControl.ts)다. 운영자(dev·admin)도 목록은 내 유닛만 —
//   남의 유닛은 지도에서 눌러 고른다(전체 유닛 목록은 수천이 될 수 있다).
// - 직무는 정산 전 메모리 값이다(사이보그 화면처럼 정산하지 않는다 — 목록 표시용).
// 세계 규칙·표는 바꾸지 않는다.
import type { MapUnit, MapUnitKind, MapUnitsResponse } from "@terra/shared/mapUnits";
import type { Viewer } from "../trpc/context.ts";
import { CELL_UNITS, PLACEMENT_SIZE, arrivalAt, positionAt } from "@terra/sim";
import { jobOf, unitTypeOf } from "../roster/worldUnits.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { injuryAt } from "../world/unitCondition.ts";
import { canCommandAnyUnit, unitHold } from "../world/unitControl.ts";
import { UNIT_KIND_CYBORG } from "../world/unitKinds.ts";

/** 이 조회가 세계에서 읽는 것(시험은 가짜를 넣는다) */
export interface MapUnitSource {
  map(mapKey: number): Pick<SecondMap, "forEachUnit" | "unitInfo"> | undefined;
  /** 사용자의 소유 주체(없으면 내 유닛 없음) */
  ownerOfUser(userId: string): number | undefined;
  /** 사이보그 이름(없으면 undefined) */
  cyborgName(userId: string): string | undefined;
}

export interface MapUnitReads {
  mapUnits(viewer: Viewer, mapKey: number, nowMs: number): MapUnitsResponse;
}

/** 세계 유닛 종류 코드 → 목록 종류(사이보그 본체는 따로, 나머지는 유닛 화면과 같은 이름) */
function kindOf(kind: number): MapUnitKind {
  if (kind === UNIT_KIND_CYBORG) return "cyborg_body";
  const type = unitTypeOf(kind);
  return type === "creature" || type === "android" ? "test_unit" : type;
}

const clampCell = (value: number): number => Math.max(0, Math.min(PLACEMENT_SIZE - 1, value));
const injuryStage = (stage: number): MapUnit["injury"] =>
  stage >= 3 ? 3 : stage === 2 ? 2 : stage === 1 ? 1 : 0;

export function createMapUnitReads(source: MapUnitSource): MapUnitReads {
  return {
    mapUnits(viewer, mapKey, nowMs) {
      const operator = canCommandAnyUnit(viewer.roles);
      const map = source.map(mapKey);
      const ownerId = source.ownerOfUser(viewer.id);
      const base = { status: "ready", mapKey, operator, generatedAt: nowMs } as const;
      if (!map) return { ...base, loaded: false, units: [] };
      if (ownerId === undefined) return { ...base, loaded: true, units: [] };
      const mine: number[] = [];
      map.forEachUnit((unit) => {
        if (unit.ownerId === ownerId) mine.push(unit.id);
      });
      const units: MapUnit[] = [];
      for (const unitId of mine) {
        const info = map.unitInfo(unitId);
        if (!info) continue;
        const at = positionAt(info.motion, nowMs);
        const kind = kindOf(info.kind);
        units.push({
          unitId,
          kind,
          name: kind === "cyborg_body" ? (source.cyborgName(viewer.id) ?? null) : null,
          cellX: clampCell(Math.floor(at.x / CELL_UNITS)),
          cellY: clampCell(Math.floor(at.y / CELL_UNITS)),
          moving: nowMs < arrivalAt(info.motion),
          job: jobOf(info.job.job, info.job.phase),
          injury: injuryStage(injuryAt(info.condition, nowMs)),
          hold: unitHold(info, nowMs),
        });
      }
      // 사이보그 본체 먼저, 그다음 ID 차례
      units.sort(
        (a, b) => Number(b.kind === "cyborg_body") - Number(a.kind === "cyborg_body") || a.unitId - b.unitId,
      );
      return { ...base, loaded: true, units };
    },
  };
}
