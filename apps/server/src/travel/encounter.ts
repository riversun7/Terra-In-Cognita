// 좌표 유닛 조우 찾기(순수) — 기획 D-564 2차 답 1641("적끼리 만나면 자동 조우")·D-475(지도 위 유닛끼리는 전투 등 조우 이벤트),
// docs/adr/2026-11-15-unloaded-second-maps.md "바뀜 (D-564)".
// - 만남 = 같은 띄우지 않은 2차맵(1차맵 칸 하나)에 적대 관계인 두 나라의 좌표 유닛(서 있음 + 가는 중의 지금 자리)이 함께 있다. 칸 단위는 2차맵
//   (부하: 좌표 유닛은 걷기·시야가 없어 더 잘게 재지 않는다 — 1분 지표·조우 틱마다 2차맵 키로 묶는 것뿐).
// - 적대 = 두 나라가 전쟁 중(faction_wars state war, NPC 런타임 세력 wars). 나라 = 소유 주체의 나라(nationOfOwner — 가문·시민권). 나라가 없으면 만나지 않는다.
// - 배·승객은 뺀다(해상 조우 없음 — D-559 3차, 질문 1648). 띄운 2차맵·쉬는 2차맵(조우 뒤 쉬는 시간)은 부르는 쪽이 뺀다(skip).
// - 한 2차맵에 전쟁 짝이 여럿이면 나라 ID가 작은 짝 하나(다음 틱에 남은 짝). 같은 입력이면 같은 답(정렬).
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

export function findEncounters(
  units: readonly CoordinateUnit[],
  nationOf: (ownerId: number) => number | undefined,
  atWar: (a: number, b: number) => boolean,
  skip: (mapKey: number) => boolean,
): CoordinateEncounter[] {
  // 2차맵 키 → 나라 → 유닛
  const byMap = new Map<number, Map<number, CoordinateUnit[]>>();
  for (const unit of units) {
    if (unit.sea || unit.aboard !== null) continue;
    const nation = nationOf(unit.ownerId);
    if (nation === undefined) continue;
    let nations = byMap.get(unit.mapKey);
    if (!nations) {
      if (skip(unit.mapKey)) continue;
      nations = new Map();
      byMap.set(unit.mapKey, nations);
    }
    const list = nations.get(nation);
    if (list) list.push(unit);
    else nations.set(nation, [unit]);
  }
  const out: CoordinateEncounter[] = [];
  for (const mapKey of [...byMap.keys()].toSorted((a, b) => a - b)) {
    const nations = byMap.get(mapKey);
    if (!nations || nations.size < 2) continue;
    const ids = [...nations.keys()].toSorted((a, b) => a - b);
    const pair = firstWar(ids, atWar);
    if (!pair) continue;
    const sideOf = (nation: number): EncounterSide => ({
      nation,
      units: (nations.get(nation) ?? []).toSorted((a, b) => a.unitId - b.unitId),
    });
    out.push({ mapKey, sides: [sideOf(pair[0]), sideOf(pair[1])] });
  }
  return out;
}

/** 나라 ID 차례로 처음 찾은 전쟁 짝 */
function firstWar(ids: readonly number[], atWar: (a: number, b: number) => boolean): [number, number] | null {
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      if (a !== undefined && b !== undefined && atWar(a, b)) return [a, b];
    }
  }
  return null;
}
