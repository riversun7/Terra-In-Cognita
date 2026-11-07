// 시험 2차맵 자리·시험 행성 — world.ts에서 나눴다(docs/adr/2026-11-07-world-layout.md: world.ts가 커지지 않게). world.ts가 같은 이름을 다시
// 내보낸다. 세계 배치(worldLayout.ts) 뒤로 시험 2차맵 줄은 봇 규모 시험·서버 시험·화면 시험 자리이고, 고정 국가의 시작 도시는 행성 위
// 자기 자리(그 2차맵을 함께 띄운다, worldBoot.ts)에 선다. 옛 세계는 이 줄에 시작 도시가 있다(relayout.ts가 옮긴다).
import { type CellKey, EARTH_FACE_LEVEL, cellKey } from "@terra/planet";
import { DEFAULT_WORLD_PLANET_ID } from "../db/schema.ts";

/**
 * 시험 2차맵 자리(ADR 2026-10-31-second-map-from-planet 8절): S2 시험 행성(면 레벨 9) 면 0의 (i, j) = (282, 328) 칸부터
 * 오른쪽으로. 64장(MAX_TEST_MAPS)이 모두 땅·초지이고 강·호수·바다가 둘레에 없는 줄이다(지금 생성기 판에서, 시험이 본다).
 * 기기는 같은 값을 @terra/protocol S1_TEST_MAP_KEY로 안다(시험이 두 값이 같은지 본다).
 * 지형 서비스가 있으면 행성 값에서 만든 2차맵, 없으면(시험·DB 없는 개발) S1 임시 지형이다.
 */
export const TEST_MAP_ORIGIN = { face: 0, i: 282, j: 328 } as const;
export const TEST_MAP_KEY: CellKey = cellKey(
  TEST_MAP_ORIGIN.face,
  EARTH_FACE_LEVEL,
  TEST_MAP_ORIGIN.i,
  TEST_MAP_ORIGIN.j,
);

/** 시험 2차맵이 놓인 행성(콘텐츠 팩 ID). 지구가 팩에 들어오면 시험 2차맵도 옮긴다(D-372, S3 ADR "행성 ID·영역") */
export const TEST_PLANET_ID: string = DEFAULT_WORLD_PLANET_ID;
/** 시험 2차맵 k번째(0 = TEST_MAP_KEY). 규모 시험(S1_TEST_MAPS)은 오른쪽으로 나란히 둔다 */
export function testMapKey(index: number): CellKey {
  return cellKey(TEST_MAP_ORIGIN.face, EARTH_FACE_LEVEL, TEST_MAP_ORIGIN.i + index, TEST_MAP_ORIGIN.j);
}
/** 옛 시험 2차맵(S1 임시 지형 시절, S2 시험 행성에서는 깊은 바다 위) k번째. 부팅 때 행을 지운다(U4 (가), pins.ts) */
export function retiredTestMapKey(index: number): number {
  return cellKey(0, EARTH_FACE_LEVEL, 256 + index, 256);
}
/** 옛 시험 2차맵 수(그때의 S1_TEST_MAPS 상한) */
export const RETIRED_TEST_MAPS = 64;
