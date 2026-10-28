// 판정 코드와 임시 지형 생성기의 버전 (docs/PROTECTED.md, ADR 2026-10-28-simulation-model.md)

/**
 * 판정 규칙 버전. 같은 입력의 결과가 바뀌는 변경이면 올린다(경로·이동·배치 판정 포함).
 * 서버 apps/server/src/config.ts의 SIM_VERSION과 같은 값이어야 한다(나중에 이 값을 가져다 쓰게 바꾼다).
 */
export const SIM_VERSION = 1;

/**
 * S1 임시 지형 생성기 버전. 같은 시드의 출력이 바뀌면 올린다(골든 해시 시험이 잡는다).
 * 행성 생성기(S2, packages/planet)가 생기면 그쪽 generatorVersion으로 바뀐다.
 */
export const TEMP_TERRAIN_GENERATOR_VERSION = 1;
