import { describe, expect, it } from "vitest";
import { buildInfo } from "./buildInfo.ts";

describe("buildInfo", () => {
  it("차례 번호가 있으면 번호와 커밋 앞 7자", () => {
    expect(buildInfo("83709095c9ab", "307")).toEqual({ number: "307", build: "8370909" });
  });

  it("번호가 없거나 숫자가 아니면 받은 빌드 글 그대로", () => {
    expect(buildInfo("dev", "")).toEqual({ number: null, build: "dev" });
    expect(buildInfo("83709095c9ab", " ")).toEqual({ number: null, build: "83709095c9ab" });
    expect(buildInfo("83709095c9ab", "v12")).toEqual({ number: null, build: "83709095c9ab" });
  });
});
