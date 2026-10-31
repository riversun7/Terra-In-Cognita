import { EQUIP_SLOT_KINDS, PRIMARY_STAT_CODES, PRIMARY_STAT_SLOTS } from "@terra/content";
import { describe, expect, it } from "vitest";
import { PRIMARY_CODES, PRIMARY_SLOTS, SLOT_KINDS } from "./equipment.ts";

// 팩의 임시 자료 = TEST_COMBAT_CATALOG 확인은 파일을 읽어야 해서 서버 시험(apps/server/src/world/combatCatalog.test.ts)에 있다
describe("전투 자료 코드 목록", () => {
  it("칸·1차 스탯 코드 목록이 콘텐츠 스키마와 같다", () => {
    expect([...SLOT_KINDS]).toEqual([...EQUIP_SLOT_KINDS]);
    expect([...PRIMARY_CODES]).toEqual([...PRIMARY_STAT_CODES]);
    expect([...PRIMARY_SLOTS]).toEqual([...PRIMARY_STAT_SLOTS]);
  });
});
