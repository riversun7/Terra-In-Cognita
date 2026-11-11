// 캐릭터 몸틀·색 — 순수 코드. 부위 만들기(characterBody·characterHead·characterGear)가 함께 쓰는 치수와 칠.
// 치수는 키 배율을 곱하기 전 값(m)이다. 몸 비율은 3~4등신(기획 D-065): 머리 약 0.6, 몸통 약 0.56, 다리 약 0.5.
import { CHARACTER_COLORS, type CharacterColorId, type CharacterLook } from "@terra/shared/characterLook";
import { type CharacterPartList, mixColor, shadeColor } from "./characterParts.ts";

/** 몸틀: 다리·몸통·머리의 높이와 굵기, 관절 자리 */
export interface CharacterFrame {
  /** 다리 길이(바닥 ~ 엉덩이) */
  readonly legH: number;
  /** 몸통 높이·폭·두께 */
  readonly torsoH: number;
  readonly torsoW: number;
  readonly torsoD: number;
  /** 팔·다리 굵기 */
  readonly limb: number;
  /** 엉덩이 관절 x, 어깨 관절 x·y */
  readonly hipX: number;
  readonly shoulderX: number;
  readonly shoulderY: number;
  /** 팔 길이 */
  readonly armH: number;
  /** 머리 바닥 y, 머리 폭·높이·두께(머리 모양이 다시 곱한다) */
  readonly headY: number;
  readonly headW: number;
  readonly headH: number;
  readonly headD: number;
  /** 체형별 키 배율(키 배율 %와 따로) */
  readonly tall: number;
}

/** 체형마다: 다리 길이·몸통 높이·폭·두께·팔다리 굵기·머리 배율·키 배율 */
const BUILDS: Readonly<
  Record<CharacterLook["build"], readonly [number, number, number, number, number, number, number]>
> = {
  standard: [0.5, 0.56, 0.56, 0.34, 0.17, 1, 1],
  compact: [0.4, 0.5, 0.6, 0.38, 0.19, 1.08, 0.93],
  sturdy: [0.48, 0.58, 0.7, 0.4, 0.21, 0.98, 1],
  slender: [0.56, 0.58, 0.46, 0.3, 0.14, 0.95, 1.03],
};

/** 머리 기본 크기(폭·높이·두께, m) */
const HEAD_BASE = [0.62, 0.6, 0.58] as const;

export function frameOf(look: CharacterLook): CharacterFrame {
  const [legH, torsoH, torsoW, torsoD, limb, headK, tall] = BUILDS[look.build];
  const shoulderY = legH + torsoH - 0.07;
  return {
    legH,
    torsoH,
    torsoW,
    torsoD,
    limb,
    hipX: torsoW * 0.24,
    shoulderX: torsoW / 2 + limb / 2 + 0.01,
    shoulderY,
    armH: torsoH * 0.92,
    headY: legH + torsoH,
    headW: HEAD_BASE[0] * headK,
    headH: HEAD_BASE[1] * headK,
    headD: HEAD_BASE[2] * headK,
    tall,
  };
}

/** 칠: 외형의 색 다섯 + 쇠(장갑·기계 부위)·짙은 화면 색 */
export interface CharacterPaint {
  readonly skin: number;
  readonly primary: number;
  readonly secondary: number;
  readonly accent: number;
  readonly glow: number;
  /** 쇠(보조색을 밝은 강철 쪽으로 섞는다 — 장갑이 옷과 어울리게) */
  readonly metal: number;
  readonly metalDark: number;
  /** 얼굴 화면·관절의 짙은 색 */
  readonly ink: number;
}

const INK = 0x27324a;
const STEEL = 0xd5dbe4;

function hexOf(id: CharacterColorId): number {
  return Number.parseInt(CHARACTER_COLORS[id].slice(1), 16);
}

export function paintOf(look: CharacterLook): CharacterPaint {
  const secondary = hexOf(look.secondary);
  const metal = mixColor(secondary, STEEL, 0.62);
  return {
    skin: hexOf(look.skin),
    primary: hexOf(look.primary),
    secondary,
    accent: hexOf(look.accent),
    // 빛은 조금 밝게(밤에도 눈에 띄게)
    glow: shadeColor(hexOf(look.glow), 1.25),
    metal,
    metalDark: shadeColor(metal, 0.62),
    ink: INK,
  };
}

/** 부위 만들기가 받는 것 */
export interface PartContext {
  readonly list: CharacterPartList;
  readonly look: CharacterLook;
  readonly f: CharacterFrame;
  readonly p: CharacterPaint;
  /** 0 = 가까운 단계(자세한 모델), 1 = 먼 단계(큰 덩어리만) */
  readonly lod: 0 | 1;
}
