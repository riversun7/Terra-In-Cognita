import { describe, expect, it } from "vitest";
import { EARTH_RADIUS_M, makeTile } from "./testSupport.ts";
import { createTileBuilder } from "./tileBuilder.ts";

describe("타일 메시 맡기기", () => {
  it("워커가 없으면(시험·옛 브라우저) 화면 스레드에서 같은 메시를 만들고, 받은 타일을 그대로 돌려준다", async () => {
    const builder = createTileBuilder();
    const tile = makeTile(1, 8, 64, 32, 32);
    const built = await builder.build(tile, EARTH_RADIUS_M);
    expect(builder.source()).toBe("main");
    expect(built.tile).toBe(tile);
    expect(built.mesh.positions.length).toBe((33 * 33 + 4 * 33) * 3);
    builder.dispose();
    await expect(builder.build(tile, EARTH_RADIUS_M)).rejects.toThrow(/disposed/);
  });

  it("모양이 틀린 타일은 거절한다", async () => {
    const builder = createTileBuilder();
    const tile = { ...makeTile(1, 8, 64, 32, 32), water: new Uint8Array(3) };
    await expect(builder.build(tile, EARTH_RADIUS_M)).rejects.toThrow(/water/);
    builder.dispose();
  });
});
