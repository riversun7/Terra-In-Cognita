# 영토 판정도 1차맵 지도대로 (D-568)

- 일시: 2026-11-16 04:10 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-568·D-546·D-555·D-544·D-485·D-512, ADR `docs/adr/2026-11-16-territory-judgement-map.md`(새), `2026-11-03-territory-layer.md`·`2026-11-07-planet-view.md` "바뀜 (D-568)", 질문 `docs/questions/2026-11-16-territory-2.md`(1921~1930), 가지 `work/territory-2`(바탕 c24f46c)

## 한 일
- 1차맵 영토 모양 규칙(도시 원 = 배후지 × 배율·아래 끝, 같은 국가 도시·비콘 띠, 비콘↔기준 도시 줄, 삼각형, 영향력 비율 주인)을 결정적 공용 모듈 `@terra/shared/territoryMap`으로 옮겼다(사칙연산·sqrt·detAtan2·detCos만, 경계 검사 대상). 덩이·줄·삼각형마다 덮는 원으로 미리 거른다.
- 서버 판정이 그 모듈을 쓴다: `buildTerritory`/`claimAt`(서버 칸 소속·칸 표), 비콘 놓기(다른 세력 영토면 `foreign_city` — 도시 원·띠·비콘 외곽선 모두), 지방(`provinceAt` → 건물 도시 `cityAt` → 소득세 귀속·재료 자리). 옛 볼록 껍질 판정(`convexHull`·`polygonContains`)은 지웠다(응답 `hull`은 늘 null, `world.cities` `hulls` 빈 목록).
- 영토 서비스가 배후지 지금 반경(인구·발전도 등급·기술)과 설정 칸 `planet_territory_*`를 읽는다(1차맵 world.cities와 같은 함수·값). 배후지 규칙(`catchmentRadiusRulesOf`)은 `territory/catchmentRules.ts`로 옮겨 조회·판정이 같이 쓴다.
- 부팅 끝에 영토 배치를 한 번 셈해 둔다(`warm` — provinceAt이 처음부터 답한다).
- 칸 표(`rasterizeTerritory`)는 처음 찾을 때 셈한다(`planetView(…, { cells: false })`로 건너뜀 — world.cities·공격 대상·비콘 목록). 응답에 `computeMs`·`rasterMs`(측정용).
- 1차맵 화면(`territoryShapes.ts`·`territoryPick.ts`)이 같은 공용 함수를 부르고, 서버가 도시·비콘 영토 점(`point`)을 실어 판정과 같은 점으로 그린다. 범례 문구에서 "보기 전용" 뺌.
- 개발 영토 화면: 같은 `buildTerritory`(배후지·설정 칸·서버 덩이에 든 비콘), 껍질 대신 영토 원(굵은 선)·영향권(점선), 문구(lead·범례·소속 출처·foreign_city) ko·en, 지도 `data-extended`(외곽선을 넓힌 비콘 수).
- 팩 core@114: `planet_territory_*` 넷 설명에서 "보기 전용" → "판정도 같은 값"(값·ID 그대로).
- 기존 세계: 옛 비콘이 남의 영토 안이 되어도 지우지 않음(D-512 335 선례), 이미 지은 건물의 도시 그대로 — 질문 1925.

## 성능 (Verified, 임시 측정 — 커밋하지 않음, 개발 컨테이너 부하 평균 약 4.5)
| 세계(F9) | 배치 셈 | 칸 표 셈 | 칸 수 | `claimAt` 한 번 |
|---|---|---|---|---|
| 국가 4 × 도시 3 | 1.6ms | 142ms | 791 | 0.8µs |
| 국가 16 × 도시 3 × 비콘 3(144) | 6.8ms | 561ms | 6,729 | 2.2µs |
| 국가 16 × 도시 6 × 비콘 5(480) | 84ms | 1,690ms | 9,859 | 6.5µs |
| 국가 64 × 도시 4 × 비콘 4(1,024) | 65ms | 3,158ms | 32,709 | 3.1µs |
- 덮는 원 거르기 전: 16×6×5 칸 표 3,774ms·`claimAt` 19µs. 칸 표 대부분은 표본 투영(`territoryPoint`, 표본마다 약 10µs).
- 1차맵 그리기 `buildTerritoryShapes`(국가 16 × 도시 3 × 비콘 3): 옛 엔진 Math 1,761ms → 551~828ms.
- 측정 파일: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/territory-2/tmpTerritoryBench.test.ts`·`tmpShapesBench.test.ts`(저장소 밖).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/territoryMap.ts`(새)·`territoryMap.test.ts`(새), `package.json` 진입점 | 판정·표시 공용 영토 지도 |
| `packages/shared/src/territory.ts`·`territory.test.ts` | 배치 = 지도 자리, `claimAt` = 지도, 놓기 검사(남의 영토), 껍질 지움 |
| `packages/shared/src/territoryApi.ts`·`worldMap.ts` | `mapValues`·`catchmentMilli`·`territoryMilli`·`computeMs`·`rasterMs`, `point`, 표시 값 타입 = `TerritoryMapValues` |
| `packages/planet/src/territory.ts`·`territory.test.ts` | 주석, 칸 표 시험·골든(85칸) |
| `scripts/check-boundaries.mjs` | `territoryMap`을 결정성 검사에 |
| `apps/server/src/territory/service.ts`·`catchmentRules.ts`(새)·`territory.db.test.ts`·`gateway.test.ts` | 배후지·설정 칸으로 배치, `provinceAt`, 칸 표 지연 셈, 시험 |
| `apps/server/src/facilities/places.ts`·`service.ts`·`world.ts`·`appSource.ts` | 건물 도시 = 지방(영토 밖·셈 전이면 옛 규칙), 칸 표 건너뛰기 |
| `apps/server/src/world/world.ts` | 영토 서비스에 설정 칸·배후지 규칙, 부팅 끝 `warm`(997줄) |
| `apps/server/src/worldMap/reads.ts` | 영토 점 싣기, 배후지 규칙 옮김, world.cities는 칸 표 없이 |
| `apps/game/src/map/territoryShapes.ts`·`territoryPick.ts` | 공용 함수로 |
| `apps/game/src/editor/territory/*` | 같은 배치·그리기·문구 |
| `apps/game/messages/{ko,en}.json` | 문구 |
| `content/core/tuning.json`·`manifest.json` | 설명, core@114 |
| `packages/sim/src/tuningTerritoryDisplay.ts`·`society/coefficients.ts` | 주석만(시뮬은 영토를 셈하지 않는다) |
| `e2e/territory.spec.ts`·`e2e/helpers/beacons.ts`·`e2e/planet-view.spec.ts` | 껍질 → 넓힌 비콘 수, 비콘 ID 고정 기대 뺌, 빗금 시험이 옮긴 도시의 영토 점을 뺌(화면이 점을 먼저 쓴다) |
| `docs/adr/…`, `docs/questions/2026-11-16-territory-2.md` | 결정·질문 |

## 함께 바꿔야 하는 파일
- 영토 모양 규칙은 `packages/shared/src/territoryMap.ts` 한 곳(서버·화면 공용). 원 반지름 식은 `territoryCircleMilli`(서버 `buildTerritory`, 화면 `territorySitesOf`가 부른다).
- 설정 칸 `planet_territory_*`를 더하면 `TerritoryMapValues`·`TERRITORY_MAP_START`·팩·`tuningTerritoryDisplay.ts`·화면 `territoryDisplayOf`.

## 건드리지 말 것
- `foundingConflict`(새 도시 겹침, 영향권)·`urbanCityAt`(시가지)·2차맵 건설 땅 규칙 — D-568 범위 밖(질문 1922·1923·1927).

## 버전·마이그레이션·리셋
- 프로토콜 그대로(결과 코드 `foreign_city` 그대로). 팩 core@114. SIM 판 그대로(시뮬은 영토 판정을 쓰지 않는다 — `packages/sim`은 주석만).
- 마이그레이션 없음.
- **리셋 필요 없음**: 판정은 저장하지 않고 셈한다(켜면 새 규칙). 옛 비콘은 지우지 않고 영향력 비율로 이기는 곳만 넓힌다. 이미 지은 건물의 도시(시설 줄)는 그대로.

## 미검증·TODO·알려진 문제
- 칸 표 셈이 큰 세계에서 수백 ms~수 초(메인 스레드). 칸 표가 필요한 조회(개발 영토 화면·이동 확인 위험)에서만, 30초 캐시. 워커는 질문 1930.
- 1차맵은 안개로 아는 도시·비콘만 그려 판정과 다를 수 있다(질문 1928).
- `provinceAt`은 마지막 배치(30초보다 오래되면 뒤에서 다시 셈)를 쓴다 — 새 마을·주인 바뀜은 그 사이 늦게 든다. 부팅 끝에 셈해 두지만 DB 없는 세계·셈 실패면 옛 규칙.

## 사용자 결정 대기
- 질문 1921~1930.

## 확인
- Verified 단위 시험(고친 꾸러미): shared `territory.test.ts` 10·`territoryMap.test.ts` 4, planet `territory.test.ts` 5(골든 85칸·키 합 44,266,717), 게임 `map/territory*`·`editor/territory` 31, 서버 DB(`TEST_DATABASE_URL`) territory·facilities·business·boats·temple 36파일 156개, ruins·facilities·territory 20파일 77개.
- Verified `pnpm check`(DB 포함): 시험 파일 739·시험 5,567개 가운데 `ruins.db.test.ts` 1개 실패 → 원인(개발 재료 주기 `devFacilityGrant`를 지방으로 바꾼 것 — 행정 건물 재료 자리와 어긋남)을 되돌리고 그 파일 포함 20파일 77개 통과. 되돌린 뒤 전체 `pnpm check`는 다시 돌리지 않았다(그 파일 포맷·린트·타입·`check:docs`·`check:size`만).
- Verified `pnpm check:content c24f46c`: core@114 통과(호환 포함).
- Verified `pnpm build`·`node scripts/check-pwa.mjs`·`pnpm check:bundle`: 통과, 첫 화면 JS 110,076 B / 상한 131,416 B.
- Verified 화면 시험 `pnpm e2e e2e/territory.spec.ts e2e/planet-view.spec.ts`: 첫 실행 26개 중 23 통과·3 실패(비콘 ID 고정 기대 1, 빗금 시험이 옮긴 도시의 영토 점 2) → 고친 뒤 그 3개 통과.
- 사진: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/territory-2-shots/` — 개발 영토 화면 `territory-{neon,light}-ko-{390,1440}`·`territory-tables-*`(영토 원·비콘 외곽선), 1차맵 `planet-layer-territory-*-390-{pastel,dark}`·`planet-layer-territory-open-1440-pastel`.
