// 캐릭터 모델을 그리기 좋은 배열로 — 순수 코드(three를 쓰지 않는다, 시험 대상). docs/adr/2026-11-11-character-3d.md 2절.
// - 조각마다 로컬 행렬(16칸)·색(선형 RGB)·도형 번호·묶음 번호·빛나는지를 타입 배열에 담는다(프레임마다 객체를 만들지 않는다).
// - 자세: 묶음마다 행렬 하나(몸·머리는 위아래 흔들림, 팔·다리는 축 둘레 x축 돌림). 조각의 세계 행렬 = 뿌리 · 묶음 · 로컬.
// - 캐시: 외형 표지 + 단계로 찾는다. 외형 가짓수가 상한을 넘으면 통째로 비운다(다음 프레임에 다시 만든다).
import { type CharacterLook, characterLookKey } from "@terra/shared/characterLook";
import { type CharacterLod, characterModel } from "./characterModel.ts";
import { type UnitBody, unitBodyKey, unitBodyModel } from "./unitBodies.ts";
import {
  CHARACTER_SHAPES,
  type CharacterModel,
  GROUP,
  GROUP_COUNT,
  writePartMatrix,
} from "./characterParts.ts";

export interface CompiledCharacter {
  /** 조각 수 */
  readonly count: number;
  /** 조각마다 도형 번호(CHARACTER_SHAPES 차례)·묶음 번호·빛나는지(1) */
  readonly shapes: Uint8Array;
  readonly groups: Uint8Array;
  readonly glow: Uint8Array;
  /** 조각마다 로컬 행렬(열 우선 16칸)·색(선형 RGB 3칸) */
  readonly matrices: Float32Array;
  readonly colors: Float32Array;
  /** 묶음 축 자리(GROUP_COUNT × 3) */
  readonly pivots: Float32Array;
  readonly heightM: number;
  readonly halfWidthM: number;
  readonly triangles: number;
}

/** sRGB 채널(0~255) → 선형(0~1) */
function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function compileCharacter(model: CharacterModel): CompiledCharacter {
  const count = model.parts.length;
  const shapes = new Uint8Array(count);
  const groups = new Uint8Array(count);
  const glow = new Uint8Array(count);
  const matrices = new Float32Array(count * 16);
  const colors = new Float32Array(count * 3);
  model.parts.forEach((part, index) => {
    shapes[index] = CHARACTER_SHAPES.indexOf(part.shape);
    groups[index] = part.group;
    glow[index] = part.glow ? 1 : 0;
    writePartMatrix(matrices, index * 16, part);
    colors[index * 3] = toLinear((part.color >> 16) & 0xff);
    colors[index * 3 + 1] = toLinear((part.color >> 8) & 0xff);
    colors[index * 3 + 2] = toLinear(part.color & 0xff);
  });
  return {
    count,
    shapes,
    groups,
    glow,
    matrices,
    colors,
    pivots: Float32Array.from(model.pivots),
    heightM: model.heightM,
    halfWidthM: model.halfWidthM,
    triangles: model.triangles,
  };
}

/**
 * 자세: 다리 흔들림(라디안, 왼다리 앞이 +)·몸 위아래(m)·일하는 팔(라디안, 0이면 내림 — 채집 휘두르기, 사용자 요청 2026-11-14
 * "채집 모션추가". 오른팔이 이만큼 앞으로 들리고 왼팔은 조금 덜 — 두 손으로 연장을 쥔 모양)
 */
export interface CharacterPose {
  readonly swing: number;
  readonly bob: number;
  readonly chop: number;
}

export const REST_POSE: CharacterPose = { swing: 0, bob: 0, chop: 0 };
/** 일하는 팔: 왼팔은 오른팔의 이 몫만큼 든다 */
const CHOP_LEFT = 0.6;
/** 팔은 다리와 반대로, 조금 덜 흔든다 */
const ARM_SWING = 0.8;

/** x축 돌림(축 자리 py·pz 둘레) + 위로 bob을 out[o…o+15]에 쓴다(열 우선) */
function writeSwing(out: Float32Array, o: number, angle: number, py: number, pz: number, bob: number): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  out[o] = 1;
  out[o + 1] = 0;
  out[o + 2] = 0;
  out[o + 3] = 0;
  out[o + 4] = 0;
  out[o + 5] = c;
  out[o + 6] = s;
  out[o + 7] = 0;
  out[o + 8] = 0;
  out[o + 9] = -s;
  out[o + 10] = c;
  out[o + 11] = 0;
  out[o + 12] = 0;
  // t = p − R·p (+ 위아래 흔들림)
  out[o + 13] = py - (c * py - s * pz) + bob;
  out[o + 14] = pz - (s * py + c * pz);
  out[o + 15] = 1;
}

/** 묶음 행렬 여섯(GROUP_COUNT × 16)을 자세로 채운다 */
export function writeGroupMatrices(out: Float32Array, pivots: ArrayLike<number>, pose: CharacterPose): void {
  for (let group = 0; group < GROUP_COUNT; group++) {
    let angle = 0;
    // 걷기: 왼다리가 앞으로 나가면(x축 −쪽 돌림 = 발이 +z로) 오른팔이 앞으로
    if (group === GROUP.legL) angle = -pose.swing;
    else if (group === GROUP.legR) angle = pose.swing;
    else if (group === GROUP.armL) angle = pose.swing * ARM_SWING - pose.chop * CHOP_LEFT;
    else if (group === GROUP.armR) angle = -pose.swing * ARM_SWING - pose.chop;
    writeSwing(out, group * 16, angle, pivots[group * 3 + 1] ?? 0, pivots[group * 3 + 2] ?? 0, pose.bob);
  }
}

/** 캐시 상한(외형 × 단계). 넘으면 통째로 비운다 */
export const CHARACTER_CACHE_LIMIT = 512;

export class CharacterCache {
  private readonly entries = new Map<string, CompiledCharacter>();

  get(look: CharacterLook, lod: CharacterLod): CompiledCharacter {
    const key = `${lod}:${characterLookKey(look)}`;
    const found = this.entries.get(key);
    if (found) return found;
    if (this.entries.size >= CHARACTER_CACHE_LIMIT) this.entries.clear();
    const compiled = compileCharacter(characterModel(look, lod));
    this.entries.set(key, compiled);
    return compiled;
  }

  /** 사람꼴이 아닌 몸(짐승·탈것 — unitBodies.ts). 열쇠는 종류 + 칠이라 유닛마다 따로 만들지 않는다 */
  getBody(body: UnitBody, lod: CharacterLod): CompiledCharacter {
    const key = `${lod}:body:${unitBodyKey(body)}`;
    const found = this.entries.get(key);
    if (found) return found;
    if (this.entries.size >= CHARACTER_CACHE_LIMIT) this.entries.clear();
    const compiled = compileCharacter(unitBodyModel(body, lod));
    this.entries.set(key, compiled);
    return compiled;
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}
