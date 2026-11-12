// 노두 소품 그림(질문 1083 나): 그림 있는 종류만, 지금 2차맵 목록일 때만, 같은 목록이면 엔진을 다시 부르지 않는다
import { describe, expect, it } from "vitest";
import { createGatherState } from "./gatherState.ts";
import { attachObjectProps, objectPropsOf, schoolsOf } from "./objectProps.ts";

const kind = (id: string, art?: number) => ({
  id,
  name: { ko: id, en: id },
  item: "stone",
  itemName: null,
  uses: 4,
  lots: 1,
  workMs: 24_000,
  regrowMs: 3_600_000,
  facility: "mine",
  facilityName: null,
  ...(art === undefined ? {} : { art }),
});

const response = (mapKey: number) => ({
  status: "ok" as const,
  mapKey,
  kinds: [kind("boulder"), kind("stone_outcrop", 20)],
  // [번호, 종류, 남은 번수, 다시 자라는 시각]: (7, 7) 바위, (9, 3) 노두
  objects: [7 * 256 + 7, 0, 5, 0, 3 * 256 + 9, 1, 4, 0],
  generatedAt: 0,
});

describe("노두 소품 그림", () => {
  it("그림 있는 종류만, 지금 2차맵 목록일 때만", () => {
    const state = createGatherState();
    expect(objectPropsOf(state, 5)).toEqual([]);
    state.setObjects(response(5));
    expect(objectPropsOf(state, 5)).toEqual([{ cell: 3 * 256 + 9, art: 20 }]);
    expect(objectPropsOf(state, 6)).toEqual([]);
  });

  it("목록이 바뀔 때만 엔진에 넣고, 떼면 비운다", () => {
    const state = createGatherState();
    const calls: unknown[] = [];
    const detach = attachObjectProps(
      { setObjectProps: (props) => calls.push(props), setSchools: () => undefined },
      state,
      5,
    );
    expect(calls).toEqual([]);
    state.setObjects(response(5));
    state.setObjects(response(5));
    expect(calls).toEqual([[{ cell: 3 * 256 + 9, art: 20 }]]);
    detach();
    expect(calls.at(-1)).toEqual([]);
  });
});

const withSchool = (mapKey: number) => ({
  ...response(mapKey),
  kinds: [...response(mapKey).kinds, kind("school_coastal", 61)],
  objects: [...response(mapKey).objects, 65_600, 2, 4, 0, 65_601, 2, 4, 0],
  // 65,601은 길이 없어 버린다
  schools: [{ id: 65_600, points: [10, 12, 30, 12], periodMs: 40_000, phaseMs: 0 }],
});

describe("움직이는 어군(D-536)", () => {
  it("어군은 길의 첫 점이 집 자리이고 소품 덮기에 들지 않으며 엔진 어군으로 간다", () => {
    const state = createGatherState();
    state.setObjects(withSchool(5));
    expect(state.objects.map((object) => object.id)).toEqual([7 * 256 + 7, 3 * 256 + 9, 65_600]);
    expect(state.objectById(65_600)).toMatchObject({ x: 10, y: 12 });
    expect(objectPropsOf(state, 5)).toEqual([{ cell: 3 * 256 + 9, art: 20 }]);
    expect(schoolsOf(state, 5)).toEqual([
      { id: 65_600, art: 61, points: [10, 12, 30, 12], periodMs: 40_000, phaseMs: 0 },
    ]);
    expect(schoolsOf(state, 6)).toEqual([]);
    const sent: unknown[] = [];
    const detach = attachObjectProps(
      { setObjectProps: () => undefined, setSchools: (list) => sent.push(list) },
      state,
      5,
    );
    state.setObjects(withSchool(5));
    expect(sent).toHaveLength(1);
    detach();
    expect(sent.at(-1)).toEqual([]);
  });
});
