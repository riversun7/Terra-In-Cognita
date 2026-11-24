// 장비 칸 목록·화면 차례 시험 — 옛 프로젝트 칸 수(일반장비 10 + 인공장기 10, 사용자 결정 2026-11-24, docs/adr/2026-11-24-unit-cyborg-unify.md)
import { describe, expect, it } from "vitest";
import {
  EQUIP_SLOTS,
  EQUIP_SLOT_DISPLAY_ORDER,
  ORGAN_EQUIP_SLOTS,
  PRIMARY_EQUIP_SLOTS,
  isOrganSlot,
  sortSlotsForDisplay,
} from "./roster.ts";

/** 팩 unit_kinds cyborg 칸 배치(옛 9칸 자리는 그대로 두고 새 칸을 뒤에 붙였다) */
const CYBORG = [
  "weapon",
  "offhand",
  "head",
  "body",
  "ring",
  "ring",
  "organ_heart",
  "organ_head",
  "organ_body",
  "hands",
  "feet",
  "totem",
  "necklace",
  "organ_arm",
  "organ_leg",
  "implant",
  "implant",
  "implant",
  "implant",
  "implant",
];

describe("장비 칸", () => {
  it("화면 차례 표는 모든 칸 종류를 한 번씩 갖는다", () => {
    expect([...EQUIP_SLOT_DISPLAY_ORDER].toSorted()).toEqual([...EQUIP_SLOTS].toSorted());
  });

  it("사이보그 칸을 옛 프로젝트 화면 차례로 놓는다: 일반장비 10(헬멧 … 목걸이) → 인공장기 10(헤드 … 임플란트 5)", () => {
    const cells = sortSlotsForDisplay(CYBORG);
    const gear = cells.filter((cell) => !isOrganSlot(cell.kind));
    const organ = cells.filter((cell) => isOrganSlot(cell.kind));
    expect(gear.map((cell) => `${cell.kind}${cell.ordinal > 0 ? String(cell.ordinal) : ""}`)).toEqual([
      "head",
      "body",
      "hands",
      "feet",
      "totem",
      "weapon",
      "offhand",
      "ring1",
      "ring2",
      "necklace",
    ]);
    expect(organ.map((cell) => `${cell.kind}${cell.ordinal > 0 ? String(cell.ordinal) : ""}`)).toEqual([
      "organ_head",
      "organ_body",
      "organ_heart",
      "organ_arm",
      "organ_leg",
      "implant1",
      "implant2",
      "implant3",
      "implant4",
      "implant5",
    ]);
    // 칸 번호(보유 물건 slot)는 팩 차례의 자리 그대로다: 반지 1 = 4번, 심장 = 6번(옛 장신구·인공장기 자리)
    expect(gear.find((cell) => cell.kind === "ring")?.index).toBe(4);
    expect(organ.find((cell) => cell.kind === "organ_heart")?.index).toBe(6);
  });

  it("모르는 칸 종류는 끝에 팩 차례대로 둔다", () => {
    expect(sortSlotsForDisplay(["zz", "weapon", "aa"]).map((cell) => cell.kind)).toEqual([
      "weapon",
      "zz",
      "aa",
    ]);
  });

  it("인공장기·임플란트·부품은 1차 스탯 칸이다(D-423), 장갑·신발은 방어구라 2차 수치 칸이다", () => {
    const primary: readonly string[] = PRIMARY_EQUIP_SLOTS;
    for (const slot of ORGAN_EQUIP_SLOTS) expect(primary).toContain(slot);
    for (const slot of ["ring", "necklace", "totem"]) expect(primary).toContain(slot);
    for (const slot of ["weapon", "offhand", "head", "body", "hands", "feet"])
      expect(primary).not.toContain(slot);
  });
});
