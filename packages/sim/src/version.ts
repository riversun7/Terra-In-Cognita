// 판정 코드와 임시 지형 생성기의 버전 (docs/PROTECTED.md, ADR 2026-10-28-simulation-model.md)

/**
 * 판정 규칙 버전. 같은 입력의 결과가 바뀌는 변경이면 올린다(경로·이동·배치 판정 포함).
 * 서버 apps/server/src/config.ts의 SIM_VERSION과 같은 값이어야 한다(나중에 이 값을 가져다 쓰게 바꾼다).
 * 2: 출발과 목표가 다른 연결 영역이면 길찾기가 펼치지 않고 바로 no_path(예산이 걸리던 길 없는 목표가 budget_exceeded 대신
 *    no_path, 찾는 길은 그대로. ADR 2026-10-31-second-map-from-planet "구현하며 정한 것 (WP-3)")
 * 3: 전투 피해를 물리 몫·속성 몫으로 나눔(D-459: 물리 → 아머, 속성 → 쉴드, 고정 방어 뒤 크리·스킬·버프), 계열 값 1:1(D-457),
 *    같은 계열 rate −30‰(C10), 2차 스탯 17개(D-458: 명중·크리 점수, 속성 방어율, 스태미나·MP 회복·쉴드 재생 행).
 *    ADR 2026-10-31-combat-core "바뀜 (2026-11-01, D-457~D-459)"
 * 4: 전투 틱 안 유닛 행동 차례를 ID 차례에서 (시드, 틱)으로 섞은 차례로(같은 유닛끼리도 ID·거리 홀짝으로 선공이 정해지던 편 쏠림).
 *    ADR 2026-11-01-balance-screen "편 쏠림"
 */
export const SIM_VERSION = 4;

/**
 * S1 임시 지형 생성기 버전. 같은 시드의 출력이 바뀌면 올린다(골든 해시 시험이 잡는다).
 * 행성 생성기(S2, packages/planet)가 생기면 그쪽 generatorVersion으로 바뀐다.
 */
export const TEMP_TERRAIN_GENERATOR_VERSION = 1;
