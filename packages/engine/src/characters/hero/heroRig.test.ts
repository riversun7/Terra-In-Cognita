// 게임형 3D 캐릭터(V2) 리깅 단위 시험 — 모든 프리셋 24종·부위 조합·포즈 4종이 오류 없이 조립되고 정리되는지 확인한다.
import {
  CHARACTER_PARTS,
  CHARACTER_PRESETS,
  DEFAULT_CHARACTER_LOOK,
  type CharacterLook,
} from "@terra/shared/characterLook";
import { describe, expect, it } from "vitest";
import { type HeroPoseId, buildHeroRig } from "./heroRig.ts";

describe("heroRig (V2 게임형 3D 캐릭터)", () => {
  it("24개 전체 프리셋이 유효한 파츠·삼각형·키를 만들고 정리된다", () => {
    for (const preset of CHARACTER_PRESETS) {
      const rig = buildHeroRig(preset.look);
      expect(rig.partCount).toBeGreaterThan(20);
      expect(rig.triangleCount).toBeGreaterThan(500);
      expect(rig.heightM).toBeGreaterThan(1.3);
      expect(rig.heightM).toBeLessThan(2.6);
      rig.dispose();
    }
  });

  it("모든 부위 ID(head·face·top·torso·arms·legs·back·extra·plating 0~3)가 예외 없이 조립된다", () => {
    const slots = ["build", "head", "face", "top", "torso", "arms", "legs", "back", "extra"] as const;
    for (const slot of slots) {
      for (const value of CHARACTER_PARTS[slot]) {
        const look = { ...DEFAULT_CHARACTER_LOOK, [slot]: value } as CharacterLook;
        const rig = buildHeroRig(look);
        expect(rig.partCount).toBeGreaterThan(15);
        rig.dispose();
      }
    }
    for (const plating of [0, 1, 2, 3]) {
      const rig = buildHeroRig({ ...DEFAULT_CHARACTER_LOOK, plating });
      expect(rig.partCount).toBeGreaterThan(15);
      rig.dispose();
    }
  });

  it("4가지 포즈(idle·combat·walk·inspect)와 보조 피벗(망토·날개·포니테일)이 동작한다", () => {
    const rig = buildHeroRig({
      ...DEFAULT_CHARACTER_LOOK,
      top: "ponytail",
      back: "wings",
    });
    expect(rig.ponytailPivot).not.toBeNull();
    expect(rig.wingLPivot).not.toBeNull();
    expect(rig.wingRPivot).not.toBeNull();
    const poses: readonly HeroPoseId[] = ["idle", "combat", "walk", "inspect"];
    for (const pose of poses) {
      rig.applyPose(pose, 1.25);
      expect(Number.isFinite(rig.pelvis.position.y)).toBe(true);
    }
    rig.dispose();
  });
});
