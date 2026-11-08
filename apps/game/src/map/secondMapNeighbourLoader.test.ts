// 이웃 받기: 경계 가까이 그쪽만, 모두 받기, 같은 이웃은 한 번만, 판 표지가 바뀌면 처음부터
import type { NeighbourTerrain, TerrainInput } from "@terra/engine";
import { cellKey } from "@terra/planet";
import { describe, expect, it } from "vitest";
import { createNeighbourLoader } from "./secondMapNeighbourLoader.ts";

const KEY = cellKey(0, 9, 282, 328);
const SIZE = 1500;
const fakeTerrain: TerrainInput = {
  heights: new Int16Array(129 * 129),
  surface: new Uint8Array(128 * 128),
  baseHeightM: 0,
  cellSizeM: 11.7,
  waterLevelM: 0,
};

function setup(all: boolean) {
  const urls: string[] = [];
  const lists: (readonly NeighbourTerrain[])[] = [];
  const near: (readonly number[])[] = [];
  const loader = createNeighbourLoader({
    mapKey: KEY,
    all,
    onNear: (keys) => near.push(keys),
    setNeighbours: (list) => {
      lists.push(list);
      return Promise.resolve();
    },
    fetchTerrain: (url) => {
      urls.push(url);
      return Promise.resolve(fakeTerrain);
    },
  });
  return { loader, urls, lists, near };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("이웃 받기", () => {
  it("지형 주소를 알기 전에는 받지 않고, 경계 가까이 오면 그쪽(오른쪽) 이웃만 한 번 받는다", async () => {
    const { loader, urls, lists } = setup(false);
    loader.onView(SIZE - 10, SIZE / 2);
    expect(urls).toEqual([]);
    loader.setMain(`/api/maps/${KEY}/terrain?v=1.3.aaaaaaaa.bbbbbbbb`, SIZE);
    loader.onView(SIZE / 2, SIZE / 2);
    expect(urls).toEqual([]);
    loader.onView(SIZE - 10, SIZE / 2);
    loader.onView(SIZE - 5, SIZE / 2);
    await settle();
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\?v=1\.3\.aaaaaaaa\.bbbbbbbb$/);
    expect(lists.at(-1)?.map((item) => item.placement.tx)).toEqual([128]);
  });

  it("모두 받기면 지형 주소가 오자마자 8장, 판 표지가 바뀌면 비우고 다시 받는다", async () => {
    const { loader, urls, lists } = setup(true);
    loader.setMain(`/api/maps/${KEY}/terrain?v=1.3.aaaaaaaa.bbbbbbbb`, SIZE);
    await settle();
    expect(urls).toHaveLength(8);
    expect(lists.at(-1)).toHaveLength(8);
    loader.setMain(`/api/maps/${KEY}/terrain?v=1.3.aaaaaaaa.cccccccc`, SIZE);
    await settle();
    expect(lists.some((list) => list.length === 0)).toBe(true);
    expect(urls).toHaveLength(16);
    loader.stop();
  });

  it("카메라 쪽 이웃이 바뀔 때만 알린다(이웃 안개 구독, WP-3): 가운데 = 알리지 않음, 오른쪽 변 = 하나, 모서리 = 셋", () => {
    const { loader, near } = setup(false);
    loader.setMain(`/api/maps/${KEY}/terrain?v=1.3.aaaaaaaa.bbbbbbbb`, SIZE);
    loader.onView(SIZE / 2, SIZE / 2);
    loader.onView(SIZE - 10, SIZE / 2);
    loader.onView(SIZE - 5, SIZE / 2);
    loader.onView(SIZE - 5, SIZE - 5);
    expect(near.map((keys) => keys.length)).toEqual([1, 3]);
    loader.stop();
  });
});
