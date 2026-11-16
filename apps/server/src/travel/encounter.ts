// 좌표 유닛 조우 찾기(순수) — 기획 D-564 2차 답 1641("적끼리 만나면 자동 조우")·D-475(지도 위 유닛끼리는 전투 등 조우 이벤트),
// docs/adr/2026-11-15-unloaded-second-maps.md "바뀜 (D-564)"·"바뀜 (D-570, 좌표 이동 3)".
// - 만남 = 같은 띄우지 않은 2차맵(1차맵 칸 하나)에 다른 나라의 좌표 유닛(서 있음 + 가는 중의 지금 자리)이 함께 있다. 칸 단위는 2차맵
//   (부하: 좌표 유닛은 걷기·시야가 없어 더 잘게 재지 않는다 — 조우 틱마다 2차맵 키로 묶는 것뿐).
// - 바뀜(D-570 — 질문 1904 "다른 나라면 모두 대상"): 전쟁 중인 나라만이 아니라 다른 나라면 모두 만난다. 싸울지는 양쪽 AI 판단(clashDecide.ts)이
//   정한다. 여기서는 2차맵마다 나라별 편을 모으기만 한다. 나라 = 소유 주체의 나라(nationOfOwner — 가문·시민권). 나라가 없으면 만나지 않는다.
// - 배·승객은 뺀다(해상 조우 없음 — D-559 3차, 질문 1648). 띄운 2차맵·쉬는 2차맵은 부르는 쪽이 뺀다(skip).
// - 같은 입력이면 같은 답(2차맵 키·나라 ID·유닛 ID 차례).
import type { CoordinateUnit } from "./serviceTypes.ts";

export interface EncounterSide {
  readonly nation: number;
  /** 그 나라 좌표 유닛(유닛 ID 차례) */
  readonly units: readonly CoordinateUnit[];
}

export interface CoordinateEncounter {
  readonly mapKey: number;
  readonly sides: readonly [EncounterSide, EncounterSide];
}

/** 2차맵 키 → 나라별 편(나라 ID 차례). 두 나라 이상이 함께 선 2차맵만, 2차맵 키 차례 */
export function groupEncounters(
  units: readonly CoordinateUnit[],
  nationOf: (ownerId: number) => number | undefined,
  skip: (mapKey: number) => boolean,
): { readonly mapKey: number; readonly sides: readonly EncounterSide[] }[] {
  // 2차맵 키 → 나라 → 유닛
  const byMap = new Map<number, Map<number, CoordinateUnit[]>>();
  const skipped = new Set<number>();
  for (const unit of units) {
    if (unit.sea || unit.aboard !== null || skipped.has(unit.mapKey)) continue;
    const nation = nationOf(unit.ownerId);
    if (nation === undefined) continue;
    let nations = byMap.get(unit.mapKey);
    if (!nations) {
      if (skip(unit.mapKey)) {
        skipped.add(unit.mapKey);
        continue;
      }
      nations = new Map();
      byMap.set(unit.mapKey, nations);
    }
    const list = nations.get(nation);
    if (list) list.push(unit);
    else nations.set(nation, [unit]);
  }
  const out: { mapKey: number; sides: EncounterSide[] }[] = [];
  for (const mapKey of [...byMap.keys()].toSorted((a, b) => a - b)) {
    const nations = byMap.get(mapKey);
    if (!nations || nations.size < 2) continue;
    const sides = [...nations.keys()]
      .toSorted((a, b) => a - b)
      .map((nation) => ({
        nation,
        units: (nations.get(nation) ?? []).toSorted((a, b) => a.unitId - b.unitId),
      }));
    out.push({ mapKey, sides });
  }
  return out;
}

/** 편 목록의 두 나라 짝(나라 ID 차례: (0,1), (0,2), …, (1,2), …) */
export function sidePairs<T>(sides: readonly T[]): [T, T][] {
  const out: [T, T][] = [];
  for (let i = 0; i < sides.length; i++) {
    for (let j = i + 1; j < sides.length; j++) {
      const a = sides[i];
      const b = sides[j];
      if (a !== undefined && b !== undefined) out.push([a, b]);
    }
  }
  return out;
}
