// 시설 목록 시험 — 채집 사다리(질문 946 나, docs/adr/2026-11-11-production-six.md "바뀜 (2026-11-11, 946·947)"): 실제 팩(core@63)의 목장은
// 축산물 + 목축 부산물을 한 사다리로 낸다. 서버 직무 산출(gatherWork.ts)이 이 사다리를 쓴다.
import { describe, expect, it } from "vitest";
import { facilityCatalogOf } from "./catalog.ts";
import { TEST_FACILITY_SOURCE } from "./testFacilities.ts";

const catalog = facilityCatalogOf(() => TEST_FACILITY_SOURCE)();

describe("채집 사다리(서버 시설 목록)", () => {
  it("목장 = 축산물 + 목축 부산물(티어마다 한데, 팩 차례), 다른 시설은 중분류 하나 그대로", () => {
    const ranch = catalog.facility("ranch")?.gather;
    expect(ranch?.extraSubcategories).toEqual(["livestock_byproduct"]);
    if (!ranch) return;
    const ladder = catalog.gatherLadder(ranch);
    expect(ladder[1]).toEqual(["item:venison", "item:deer_hide", "item:deer_antler"]);
    expect(ladder.flat()).toHaveLength(30);
    // 같은 사다리를 다시 만들지 않는다
    expect(catalog.gatherLadder(ranch)).toBe(ladder);
    const fishing = catalog.facility("fishing_spot")?.gather;
    if (fishing) expect(catalog.gatherLadder(fishing).flat()).toHaveLength(26);
    expect(catalog.gatherLadder({ subcategory: "livestock_product" }).flat()).toHaveLength(13);
  });
});
