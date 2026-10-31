// 판정 코드와 임시 지형 생성기의 버전 (docs/PROTECTED.md, ADR 2026-10-28-simulation-model.md)

/**
 * 판정 규칙 버전. 같은 입력의 결과가 바뀌는 변경이면 올린다(경로·이동·배치 판정 포함).
 * 서버 apps/server/src/config.ts의 SIM_VERSION과 같은 값이어야 한다(나중에 이 값을 가져다 쓰게 바꾼다).
 * 2: 출발과 목표가 다른 연결 영역이면 길찾기가 펼치지 않고 바로 no_path(예산이 걸리던 길 없는 목표가 budget_exceeded 대신
 *    no_path, 찾는 길은 그대로. ADR 2026-10-31-second-map-from-planet "구현하며 정한 것 (WP-3)")
 */
export const SIM_VERSION = 2;

/**
 * S1 임시 지형 생성기 버전. 같은 시드의 출력이 바뀌면 올린다(골든 해시 시험이 잡는다).
 * 행성 생성기(S2, packages/planet)가 생기면 그쪽 generatorVersion으로 바뀐다.
 */
export const TEMP_TERRAIN_GENERATOR_VERSION = 1;
