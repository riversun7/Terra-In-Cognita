// 2차맵 생성기 판 — 출력(높이·물 높이·지표·엄폐, 결과 해시)이 한 칸이라도 바뀌면 올린다(PROTECTED, ADR 46 5절).
// 골든 해시 시험(generate.test.ts)을 같은 커밋에서 고친다. 지형 파일 주소·캐시 열쇠에 들어간다.
// 행성 생성기 판(GENERATOR_VERSION)과 따로다: 2차맵 결과는 둘 다와 행성 정의 해시에 달려 있다.
// 2: 강 폭 넓힘·건너는 자리마다 폭 배율·안쪽 물길 폭 출렁임·깊은 강 여울(rivers.ts, 사용자 지적 2026-11-21 — ADR 46 부록)
export const SECOND_MAP_GENERATOR_VERSION = 2;
