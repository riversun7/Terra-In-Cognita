// 사람꼴이 아닌 유닛 몸(임시 모델) — 순수 코드(three를 쓰지 않는다, 시험 대상). docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-12, 유닛 겉모습)".
// 사용자 지적 2026-11-12 "큰 유닛들은 캐릭터가 없는 문제": 크기 등급 2·3 유닛과 탈것은 캡슐뿐이었다. 캐릭터와 같은 조각(characterParts.ts)·
// 같은 그리기(도형마다 InstancedMesh 하나, characterMeshes.ts)로 그려 그리기 호출이 늘지 않는다.
// - 짐승(beast): 네 발 짐승. 앞다리 = 팔 묶음(armL·armR), 뒷다리 = 다리 묶음(legL·legR) — 캐릭터 걷기(팔·다리 반대로 흔들기)가 그대로 대각선
//   걸음(속보)이 된다. 크기 등급 3(크리쳐 자리)의 임시 모습.
// - 탈것(car·truck·crawler): 크기 등급 1·2·3. 바퀴·궤도는 움직이지 않는다(rigid — 층이 걷는 자세를 주지 않는다).
// - 색은 씨앗(유닛 ID)으로 고른다. 같은 씨앗이면 같은 모델이다. 꾸밈이라 Math를 써도 된다(판정 아님).
// - 삼각형 상한은 캐릭터와 같다(가까운 단계 600, 먼 단계 150 — unitBodies.test.ts가 본다). 치수는 실제 크기(m)이고, 층이 유닛 키에 맞춰 늘린다.
import type { CharacterLod } from "./characterModel.ts";
import {
  type CharacterModel,
  CharacterPartList,
  GROUP,
  GROUP_COUNT,
  countTriangles,
  partReach,
  shadeColor,
} from "./characterParts.ts";

export const UNIT_BODY_KINDS = ["beast", "car", "truck", "crawler"] as const;
export type UnitBodyKind = (typeof UNIT_BODY_KINDS)[number];

/** 사람꼴이 아닌 몸: 종류와 씨앗(색 고르기) */
export interface UnitBody {
  readonly kind: UnitBodyKind;
  readonly seed: number;
}

/** 걷는 자세를 주지 않는 몸(바퀴·궤도) */
export function isRigidBody(kind: UnitBodyKind): boolean {
  return kind !== "beast";
}

/** 짐승 가죽·탈것 칠(sRGB). 세계 색이라 화면 테마와 상관없다(D-070) */
const HIDES = [0x8c6a4f, 0x6f7f5a, 0x9a8f7a, 0x5f6f86, 0xb07a55, 0x7a5a8c] as const;
const HORNS = [0xe8d7b0, 0xd9c7a0, 0xc3cbd6] as const;
const EYES = [0xffd36e, 0xff8f6e, 0x9ff0ff] as const;
const PAINTS = [0xffcf75, 0xe8705f, 0x6f9fd8, 0x8fcf8a, 0xd9d9e0, 0xb38fd8] as const;
const TIRE = 0x3b3f4a;
const GLASS = 0x9fc8e0;
const LAMP = 0xfff1b8;
const TAIL_LAMP = 0xff6f6f;

/** 씨앗 → 목록 하나(이웃한 씨앗이 같은 색이 되지 않게 섞는다) */
function choose<T>(list: readonly T[], seed: number, salt: number): T {
  const mixed = (Math.imul(seed | 0, 0x9e37_79b1) ^ salt) >>> 0;
  const value = list[(mixed >>> 7) % list.length];
  if (value === undefined) throw new RangeError("empty list");
  return value;
}

/** 조각 목록 → 모델(묶음 축은 부르는 쪽이 준다) */
function finish(list: CharacterPartList, pivots: readonly number[]): CharacterModel {
  let heightM = 0;
  let halfWidthM = 0;
  for (const part of list.parts) {
    const reach = partReach(part);
    heightM = Math.max(heightM, reach.maxY);
    halfWidthM = Math.max(halfWidthM, reach.maxX);
  }
  return {
    parts: list.parts,
    pivots,
    heightM,
    halfWidthM,
    triangles: countTriangles(list.parts),
  };
}

/** 네 발 짐승(등 높이 약 1m, 머리 꼭대기 약 1.5m, 길이 약 2m — 층이 유닛 키에 맞춰 늘린다) */
function beastModel(
  [hide = HIDES[0], horn = HORNS[0], eye = EYES[0]]: readonly number[],
  lod: CharacterLod,
): CharacterModel {
  const belly = shadeColor(hide, 1.25);
  const dark = shadeColor(hide, 0.72);
  const list = new CharacterPartList();
  const hipY = 0.62;
  const legX = 0.25;
  const frontZ = 0.55;
  const backZ = -0.55;
  // 다리 넷: 앞다리 = 팔 묶음, 뒷다리 = 다리 묶음
  const leg = (
    left: typeof GROUP.armL | typeof GROUP.legL,
    right: typeof GROUP.armR | typeof GROUP.legR,
    z: number,
  ): void => {
    if (lod === 0) {
      list.pair(left, right, "taper", legX, 0.44, z, 0.2, 0.36, 0.22, hide, { rx: Math.PI });
      list.pair(left, right, "box", legX, 0.16, z, 0.14, 0.3, 0.16, dark);
      list.pair(left, right, "box", legX, 0.03, z + 0.03, 0.18, 0.06, 0.22, shadeColor(dark, 0.8));
    } else {
      list.pair(left, right, "box", legX, 0.31, z, 0.17, 0.62, 0.19, hide);
    }
  };
  leg(GROUP.armL, GROUP.armR, frontZ);
  leg(GROUP.legL, GROUP.legR, backZ);
  // 몸통·목·꼬리(몸 묶음)
  list.group = GROUP.body;
  list.add("box", 0, 0.84, 0, 0.64, 0.46, 1.36, hide);
  list.add("taper", 0, 1.04, 0.74, 0.34, 0.42, 0.36, hide, { rx: 0.6 });
  list.add("taper", 0, 0.86, -0.86, 0.14, 0.42, 0.14, dark, { rx: -2.1 });
  if (lod === 0) {
    list.add("box", 0, 0.6, 0.02, 0.5, 0.12, 1.1, belly);
    list.add("ball", 0, 1.02, 0.42, 0.62, 0.42, 0.56, shadeColor(hide, 1.08));
    for (const [z, h] of [
      [0.3, 0.2],
      [0, 0.24],
      [-0.3, 0.18],
    ] as const)
      list.add("cone", 0, 1.08 + h / 2, z, 0.12, h, 0.16, horn);
  }
  // 머리(머리 묶음)
  list.group = GROUP.head;
  list.add("box", 0, 1.22, 0.98, 0.42, 0.38, 0.46, hide);
  list.add("box", 0, 1.12, 1.27, 0.28, 0.2, 0.28, belly);
  if (lod === 0) {
    list.pair(GROUP.head, GROUP.head, "box", 0.12, 1.29, 1.21, 0.07, 0.07, 0.04, eye, { glow: true });
    list.pair(GROUP.head, GROUP.head, "cone", 0.15, 1.5, 0.9, 0.1, 0.26, 0.1, horn, { rx: -0.35, rz: -0.3 });
  }
  const pivots = Array.from({ length: GROUP_COUNT * 3 }, () => 0);
  const set = (group: number, x: number, y: number, z: number): void => {
    pivots[group * 3] = x;
    pivots[group * 3 + 1] = y;
    pivots[group * 3 + 2] = z;
  };
  set(GROUP.head, 0, 1.04, 0.74);
  set(GROUP.armL, -legX, hipY, frontZ);
  set(GROUP.armR, legX, hipY, frontZ);
  set(GROUP.legL, -legX, hipY, backZ);
  set(GROUP.legR, legX, hipY, backZ);
  return finish(list, pivots);
}

/** 바퀴 한 쌍(왼쪽·오른쪽, 몸 묶음). 6각 기둥을 옆으로 눕힌다 */
function wheels(list: CharacterPartList, x: number, z: number, diameter: number, width: number): void {
  list.pair(GROUP.body, GROUP.body, "cyl", x, diameter / 2, z, diameter, width, diameter, TIRE, {
    rz: Math.PI / 2,
  });
}

/** 차(크기 등급 1): 키 약 1.5m, 길이 3.6m */
function carModel([paint = PAINTS[0]]: readonly number[], lod: CharacterLod): CharacterModel {
  const list = new CharacterPartList();
  list.add("box", 0, 0.62, 0, 1.7, 0.55, 3.6, paint);
  list.add("taper", 0, 1.17, -0.2, 1.42, 0.56, 1.8, shadeColor(paint, 1.12));
  for (const z of [1.15, -1.15]) wheels(list, 0.78, z, 0.64, 0.26);
  if (lod === 0) {
    list.add("box", 0, 1.18, 0.66, 1.18, 0.34, 0.05, GLASS, { rx: -0.5 });
    list.add("box", 0, 0.48, 1.82, 1.6, 0.18, 0.1, shadeColor(paint, 0.7));
    list.add("box", 0, 0.48, -1.82, 1.6, 0.18, 0.1, shadeColor(paint, 0.7));
    list.pair(GROUP.body, GROUP.body, "box", 0.56, 0.7, 1.81, 0.26, 0.12, 0.05, LAMP, { glow: true });
    list.pair(GROUP.body, GROUP.body, "box", 0.6, 0.7, -1.81, 0.2, 0.1, 0.05, TAIL_LAMP, { glow: true });
  }
  return finish(
    list,
    Array.from({ length: GROUP_COUNT * 3 }, () => 0),
  );
}

/** 짐차(크기 등급 2): 키 약 3.4m, 길이 7.4m */
function truckModel(
  [paint = PAINTS[0], second = PAINTS[1]]: readonly number[],
  lod: CharacterLod,
): CharacterModel {
  const cargo = shadeColor(second, 1.15);
  const list = new CharacterPartList();
  list.add("box", 0, 0.82, 0, 2.2, 0.5, 7.2, shadeColor(paint, 0.6));
  list.add("box", 0, 1.86, 2.6, 2.4, 1.9, 1.9, paint);
  list.add("box", 0, 2.12, -0.85, 2.5, 2.6, 4.7, cargo);
  const wheelZ = lod === 0 ? [2.55, -0.2, -2.4] : [2.55, -2.4];
  for (const z of wheelZ) wheels(list, 1.05, z, 1.1, 0.42);
  if (lod === 0) {
    list.add("box", 0, 2.32, 3.56, 2.0, 0.8, 0.05, GLASS);
    list.pair(GROUP.body, GROUP.body, "box", 0.82, 1.12, 3.56, 0.36, 0.2, 0.06, LAMP, { glow: true });
    list.add("box", 0, 3.48, -0.85, 2.3, 0.1, 4.5, shadeColor(cargo, 0.85));
  }
  return finish(
    list,
    Array.from({ length: GROUP_COUNT * 3 }, () => 0),
  );
}

/** 궤도 탈것(크기 등급 3): 키 약 6m, 길이 11.5m */
function crawlerModel([paint = PAINTS[0]]: readonly number[], lod: CharacterLod): CharacterModel {
  const list = new CharacterPartList();
  list.add("box", 0, 2.3, 0, 5.2, 2.2, 10.6, paint);
  list.pair(GROUP.body, GROUP.body, "box", 3.15, 1.05, 0, 1.4, 2.1, 11.5, TIRE);
  list.add("taper", 0, 4.5, -0.9, 4.0, 2.2, 5.0, shadeColor(paint, 1.12));
  if (lod === 0) {
    list.add("cyl", 1.2, 6.2, -2.2, 0.22, 1.4, 0.22, shadeColor(paint, 0.6));
    list.add("box", 0, 4.9, 1.62, 3.0, 0.8, 0.06, GLASS, { rx: -0.42 });
    list.pair(GROUP.body, GROUP.body, "box", 1.9, 2.6, 5.32, 0.6, 0.3, 0.08, LAMP, { glow: true });
    list.add("wedge", 0, 1.6, 5.6, 4.8, 1.2, 0.9, shadeColor(paint, 0.75), { ry: Math.PI / 2 });
    for (const z of [3.6, 0, -3.6])
      list.pair(GROUP.body, GROUP.body, "cyl", 3.15, 1.05, z, 1.5, 1.5, 1.5, shadeColor(TIRE, 1.3), {
        rz: Math.PI / 2,
      });
  }
  return finish(
    list,
    Array.from({ length: GROUP_COUNT * 3 }, () => 0),
  );
}

/** 사람꼴이 아닌 몸의 모델(같은 입력이면 같은 조각) */
export function unitBodyModel(body: UnitBody, lod: CharacterLod = 0): CharacterModel {
  const palette = paletteOf(body);
  switch (body.kind) {
    case "beast":
      return beastModel(palette, lod);
    case "car":
      return carModel(palette, lod);
    case "truck":
      return truckModel(palette, lod);
    case "crawler":
      return crawlerModel(palette, lod);
    default: {
      const unknown: never = body.kind;
      return unknown;
    }
  }
}

/** 씨앗 → 그 몸의 칠(같은 칠이면 같은 모델이라 캐시 열쇠가 된다 — 유닛마다 모델을 따로 만들지 않는다) */
function paletteOf(body: UnitBody): readonly number[] {
  const seed = body.seed;
  switch (body.kind) {
    case "beast":
      return [
        choose(HIDES, seed, 0x1b87_3593),
        choose(HORNS, seed, 0x2c1b_3c6d),
        choose(EYES, seed, 0x297a_2d39),
      ];
    case "car":
      return [choose(PAINTS, seed, 0x3c6e_f372)];
    case "truck":
      return [choose(PAINTS, seed, 0x5be0_cd19), choose(PAINTS, seed, 0x1f83_d9ab)];
    case "crawler":
      return [choose(PAINTS, seed, 0x137e_2179)];
    default: {
      const unknown: never = body.kind;
      return unknown;
    }
  }
}

/** 캐시 열쇠(종류 + 칠) */
export function unitBodyKey(body: UnitBody): string {
  return `${body.kind}:${paletteOf(body).join(",")}`;
}
