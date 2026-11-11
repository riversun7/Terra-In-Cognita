// 캐릭터 로우폴리 모델 — 순수 코드(three를 쓰지 않는다, 시험 대상). docs/adr/2026-11-11-character-3d.md 2절.
// 입력: 외형(@terra/shared/characterLook)·단계(0 가까운 것, 1 먼 것). 출력: 조각 목록(characterParts.ts 좌표)과 묶음 축 자리·크기.
// - 같은 외형이면 늘 같은 조각이 나온다(난수 없음). 꾸밈이라 Math를 써도 된다(판정 아님).
// - 삼각형 상한: 단계 0 ≤ 600, 단계 1 ≤ 150(characterModel.test.ts가 프리셋·무작위·칸마다 가장 큰 값의 합으로 본다).
// - 키: 발바닥 ~ 머리 꼭대기(머리 장식 제외)가 BASE_HEIGHT_M × 체형 배율 × 키 배율(%)이 되게 마지막에 통째로 늘리고 줄인다.
import type { CharacterLook } from "@terra/shared/characterLook";
import { addArms, addLegs, addTorso } from "./characterBody.ts";
import { type PartContext, frameOf, paintOf } from "./characterFrame.ts";
import { addBack, addExtra, addPlating } from "./characterGear.ts";
import { addFace, addHead, addTop } from "./characterHead.ts";
import {
  type CharacterModel,
  type CharacterPart,
  CharacterPartList,
  GROUP,
  GROUP_COUNT,
  countTriangles,
  partReach,
} from "./characterParts.ts";

/** 머리 장식을 뺀 기본 키(m, 키 배율 100%·보통 체형). 2차맵 유닛 기본 키(1.8m) 안에 머리 장식까지 대체로 든다 */
export const BASE_HEIGHT_M = 1.7;
/** 단계별 삼각형 상한 */
export const TRIANGLE_BUDGET = { lod0: 600, lod1: 150 } as const;

export type CharacterLod = 0 | 1;

export function characterModel(look: CharacterLook, lod: CharacterLod = 0): CharacterModel {
  const f = frameOf(look);
  const list = new CharacterPartList();
  const c: PartContext = { list, look, f, p: paintOf(look), lod };
  addLegs(c);
  addTorso(c);
  addArms(c);
  addHead(c);
  addFace(c);
  addTop(c);
  addBack(c);
  addExtra(c);
  addPlating(c);

  const k = (BASE_HEIGHT_M * f.tall * (look.height / 100)) / (f.legH + f.torsoH + f.headH);
  const parts = list.parts.map(
    (part): CharacterPart => ({
      ...part,
      x: part.x * k,
      y: part.y * k,
      z: part.z * k,
      sx: part.sx * k,
      sy: part.sy * k,
      sz: part.sz * k,
    }),
  );
  const pivots = Array.from({ length: GROUP_COUNT * 3 }, () => 0);
  const setPivot = (group: number, x: number, y: number): void => {
    pivots[group * 3] = x * k;
    pivots[group * 3 + 1] = y * k;
  };
  setPivot(GROUP.head, 0, f.headY);
  setPivot(GROUP.armL, -f.shoulderX, f.shoulderY);
  setPivot(GROUP.armR, f.shoulderX, f.shoulderY);
  setPivot(GROUP.legL, -f.hipX, f.legH);
  setPivot(GROUP.legR, f.hipX, f.legH);

  let heightM = 0;
  let halfWidthM = 0;
  for (const part of parts) {
    const reach = partReach(part);
    heightM = Math.max(heightM, reach.maxY);
    halfWidthM = Math.max(halfWidthM, reach.maxX);
  }
  return { parts, pivots, heightM, halfWidthM, triangles: countTriangles(parts) };
}
