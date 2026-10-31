// 작업 사본 저장소 시험 — 글 형식, 새 행성 사본(이름·시작점), 저장소를 못 쓸 때 메모리, 마지막 행성
import { describe, expect, it } from "vitest";
import type { StorageLike } from "./crashSentinel.ts";
import { TEST_PLANET } from "./testDefinitions.ts";
import {
  LAST_PLANET_KEY,
  NEW_PLANET_KEY,
  WORKING_COPY_PREFIX,
  createWorkingCopyStore,
  parseWorkingCopy,
  serializeWorkingCopy,
} from "./workingCopy.ts";

function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const ID = "7d1f4a52-3a9e-4c1b-9f0e-2b6c8d4e5a10";

describe("작업 사본", () => {
  it("보관함 행성 사본은 시작한 판과 항목을 오간다", () => {
    const copy = { key: ID, fromRevision: 3, entry: TEST_PLANET };
    expect(parseWorkingCopy(serializeWorkingCopy(copy), ID)).toEqual(copy);
  });

  it("새 행성 사본은 이름·시작점이 있어야 한다", () => {
    const copy = {
      key: NEW_PLANET_KEY,
      fromRevision: 0,
      entry: TEST_PLANET,
      name: "지구형 행성 1",
      base: { kind: "pack", id: "s2_test_planet" } as const,
    };
    expect(parseWorkingCopy(serializeWorkingCopy(copy), NEW_PLANET_KEY)).toEqual(copy);
    const nameless = serializeWorkingCopy({ key: NEW_PLANET_KEY, fromRevision: 0, entry: TEST_PLANET });
    expect(parseWorkingCopy(nameless, NEW_PLANET_KEY)).toBeNull();
  });

  it("틀린 글·다른 형식 판은 버린다", () => {
    expect(parseWorkingCopy(null, ID)).toBeNull();
    expect(parseWorkingCopy("{", ID)).toBeNull();
    expect(parseWorkingCopy(JSON.stringify({ v: 2, fromRevision: 1, entry: {} }), ID)).toBeNull();
    expect(parseWorkingCopy(JSON.stringify({ v: 1, fromRevision: -1, entry: {} }), ID)).toBeNull();
  });

  it("저장소에 행성마다 열쇠 하나, 지우기·마지막 행성", () => {
    const storage = fakeStorage();
    const store = createWorkingCopyStore(storage);
    store.write({ key: ID, fromRevision: 1, entry: TEST_PLANET });
    expect([...storage.data.keys()]).toEqual([`${WORKING_COPY_PREFIX}${ID}`]);
    expect(store.read(ID)?.fromRevision).toBe(1);
    store.clear(ID);
    expect(store.read(ID)).toBeNull();
    store.setLastPlanet(ID);
    expect(storage.data.get(LAST_PLANET_KEY)).toBe(ID);
    expect(store.lastPlanet()).toBe(ID);
  });

  it("저장소가 던지면 이번 실행 동안 메모리에 남는다", () => {
    const broken: StorageLike = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => undefined,
    };
    const store = createWorkingCopyStore(broken);
    store.write({ key: ID, fromRevision: 2, entry: TEST_PLANET });
    expect(store.read(ID)?.fromRevision).toBe(2);
    expect(createWorkingCopyStore(null).read(ID)).toBeNull();
  });
});
