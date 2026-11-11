import { describe, expect, it } from "vitest";
import { planetOfSearch } from "./planetScopeStore.ts";

describe("주소의 ?planet=", () => {
  it("행성 ID 모양과 전체(*)만 읽는다", () => {
    expect(planetOfSearch("/dev/world-layout?planet=s2_test_planet")).toBe("s2_test_planet");
    expect(planetOfSearch("?tab=units&planet=s2_test_planet")).toBe("s2_test_planet");
    expect(planetOfSearch("/ops?planet=*")).toBe("*");
    expect(planetOfSearch("/ops?planet=%2A")).toBe("*");
    expect(planetOfSearch("/ops")).toBeNull();
    expect(planetOfSearch("/ops?planet=")).toBeNull();
    expect(planetOfSearch("/ops?planet=Mars%20One")).toBeNull();
    // #조각 뒤는 검색어가 아니다
    expect(planetOfSearch("/ops?tab=units#planet=s2_test_planet")).toBeNull();
  });
});
