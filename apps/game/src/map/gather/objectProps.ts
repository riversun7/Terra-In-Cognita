// 서버 채집 오브젝트의 소품 그림(노두 — 기획 D-534 질문 1083 나 "낮은 땅 플레이어도 서버가 놓는 노두에서 석재·구리"). 노두는 지형 파일(생성기)에
// 없는 그림이라 기기가 오브젝트 자리에 덮어 세운다(엔진 setObjectProps — 판정 아님). 종류 표(gather.objects kinds)의 art가 있는 종류만,
// 지금 2차맵 목록일 때만(옆 2차맵으로 넘은 직후 옛 목록을 그리지 않는다). 엔진을 가져오지 않는다(형만).
// 움직이는 어군(기획 D-536)은 길을 엔진 setSchools로 넘긴다(엔진이 서버 시각으로 자리를 낸다).
import type { ObjectProp, SchoolInput, SecondMapEngine } from "@terra/engine";
import type { GatherState } from "./gatherState.ts";

/** 배치 칸 한 변(오브젝트 번호 = y × 256 + x) */
const PLACEMENT_CELLS = 256;

/** 채집 상태 → 덮어 세울 소품(번호 차례). 다른 2차맵 목록이거나 그림 있는 종류가 없으면 빈 목록 */
export function objectPropsOf(
  state: Pick<GatherState, "kinds" | "objects" | "objectsMapKey">,
  mapKey: number,
): ObjectProp[] {
  if (state.objectsMapKey !== mapKey) return [];
  const out: ObjectProp[] = [];
  for (const object of state.objects) {
    const art = state.kinds[object.kind]?.art ?? 0;
    // 움직이는 어군은 소품 덮기가 아니라 엔진 어군(schoolsOf)으로 그린다
    if (
      object.route ||
      art <= 0 ||
      object.x < 0 ||
      object.y < 0 ||
      object.x >= PLACEMENT_CELLS ||
      object.y >= PLACEMENT_CELLS
    )
      continue;
    out.push({ cell: object.y * PLACEMENT_CELLS + object.x, art });
  }
  return out.toSorted((a, b) => a.cell - b.cell);
}

/** 채집 상태 → 엔진 어군(움직이는 어군 — 기획 D-536). 다른 2차맵 목록이거나 그림 있는 어군이 없으면 빈 목록 */
export function schoolsOf(
  state: Pick<GatherState, "kinds" | "objects" | "objectsMapKey">,
  mapKey: number,
): SchoolInput[] {
  if (state.objectsMapKey !== mapKey) return [];
  const out: SchoolInput[] = [];
  for (const object of state.objects) {
    const art = state.kinds[object.kind]?.art ?? 0;
    if (!object.route || art <= 0) continue;
    out.push({ id: object.id, art, ...object.route });
  }
  return out;
}

/** 채집 상태가 바뀌면 엔진 소품·어군을 바꾼다(목록이 같으면 그대로). 떼면 비운다 */
export function attachObjectProps(
  engine: Pick<SecondMapEngine, "setObjectProps" | "setSchools">,
  state: Pick<GatherState, "kinds" | "objects" | "objectsMapKey" | "subscribe">,
  mapKey: number,
): () => void {
  let key = "";
  let schoolKey = "";
  const sync = (): void => {
    const props = objectPropsOf(state, mapKey);
    const next = props.map((prop) => `${prop.cell}:${prop.art}`).join(",");
    if (next !== key) {
      key = next;
      engine.setObjectProps(props);
    }
    const schools = schoolsOf(state, mapKey);
    const nextSchools = schools.map((school) => `${school.id}:${school.art}:${school.periodMs}`).join(",");
    if (nextSchools !== schoolKey) {
      schoolKey = nextSchools;
      engine.setSchools(schools);
    }
  };
  sync();
  const unsubscribe = state.subscribe(sync);
  return () => {
    unsubscribe();
    if (key !== "") engine.setObjectProps([]);
    if (schoolKey !== "") engine.setSchools([]);
  };
}
