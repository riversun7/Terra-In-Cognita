// [제안 적용] 시험 — 작업 사본에 적도·극 기온을 쓴다(있던 사본·시작 판은 지킨다), 극 ≤ 적도 차례, 마지막으로 연 행성
import { stellarFlux, suggestTemperatures } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { entrySettings, withSetting } from "../planet/editorModel.ts";
import { TEST_PLANET } from "../planet/testDefinitions.ts";
import { createWorkingCopyStore } from "../planet/workingCopy.ts";
import { EARTH_REFERENCE, applySuggestion, withTemperatures } from "./applySuggestion.ts";

const PLANET_ID = "0b6f1c9e-3a52-4d8e-9f10-2c3d4e5f6a7b";

describe("기온 쓰기", () => {
  it("올릴 때도 내릴 때도 두 값이 그대로 들어간다(극 ≤ 적도)", () => {
    const warm = withTemperatures(TEST_PLANET, { equatorTemperatureC: 50, poleTemperatureC: 30 });
    expect(entrySettings(warm)).toMatchObject({ equatorTemperatureC: 50, poleTemperatureC: 30 });
    const cold = withTemperatures(warm, { equatorTemperatureC: -10, poleTemperatureC: -60 });
    expect(entrySettings(cold)).toMatchObject({ equatorTemperatureC: -10, poleTemperatureC: -60 });
    // 극이 지금 적도보다 높아지는 쪽으로 올려도 맞는다
    const hot = withTemperatures(cold, { equatorTemperatureC: 40, poleTemperatureC: 20 });
    expect(entrySettings(hot)).toMatchObject({ equatorTemperatureC: 40, poleTemperatureC: 20 });
  });

  it("지구 기준은 보통 프리셋(27°C·−24°C)", () => {
    expect(EARTH_REFERENCE).toMatchObject({ equatorTemperatureC: 27, poleTemperatureC: -24 });
  });
});

describe("작업 사본에 적용", () => {
  it("사본이 없으면 서버 정의·판에서 시작하고, 마지막으로 연 행성이 된다", () => {
    const store = createWorkingCopyStore(null);
    const suggestion = suggestTemperatures(stellarFlux(1, 0.8), EARTH_REFERENCE);
    const copy = applySuggestion(store, { id: PLANET_ID, revision: 4, definition: TEST_PLANET }, suggestion);
    expect(copy.fromRevision).toBe(4);
    expect(store.read(PLANET_ID)).toEqual(copy);
    expect(store.lastPlanet()).toBe(PLANET_ID);
    expect(entrySettings(copy.entry)).toMatchObject({
      equatorTemperatureC: suggestion.equatorTemperatureC,
      poleTemperatureC: suggestion.poleTemperatureC,
    });
    // 기온 밖의 칸은 그대로
    expect(entrySettings(copy.entry).landPercent).toBe(entrySettings(TEST_PLANET).landPercent);
  });

  it("사본이 있으면 그 위에 쓴다(고치던 값·시작 판을 지킨다)", () => {
    const store = createWorkingCopyStore(null);
    const edited = withSetting(TEST_PLANET, "landPercent", 55);
    store.write({ key: PLANET_ID, fromRevision: 2, entry: edited });
    const copy = applySuggestion(
      store,
      { id: PLANET_ID, revision: 7, definition: TEST_PLANET },
      { equatorTemperatureC: 10, poleTemperatureC: -40 },
    );
    expect(copy.fromRevision).toBe(2);
    expect(entrySettings(copy.entry)).toMatchObject({
      landPercent: 55,
      equatorTemperatureC: 10,
      poleTemperatureC: -40,
    });
  });
});
