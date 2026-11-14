# 1차맵 영토 표시 2 — 표시 값 설정 칸, 영향력 비율 경계, 도시 소유 비콘 외곽선, 비슷한 색 이웃 빗금, 좁은 화면 레이어 판 닫기

- 일시: 2026-11-15 08:15 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-544·D-546, ADR `docs/adr/2026-11-07-planet-view.md` "바뀜 (2026-11-15 D-546)", `docs/adr/2026-11-03-territory-layer.md` "바뀜 (2026-11-15)", 질문 `docs/questions/2026-11-14-planet-ui-2.md`(1471~1472), 가지 `work/planet-ui-2`(main c8e732c + 기획 미러 2192a9ae85 합침)

## 한 일
- 처음 지시(D-544): 표시 상수 셋을 설정 칸으로, 비콘마다 작은 원(1434 가). 작업 중 기획 D-546(사용자가 1431·1432·1434·1435·1436을 다시 답함)이 와서 그 답으로 바꿨다. 작은 원 안은 버렸다.
- 표시 값 → 설정 칸(core@95, [임시]·보기 전용): `planet_territory_corridor_cells` 12, `planet_territory_radius_scale_pm` 2000(= 2배), `planet_territory_min_cells` 4, `planet_territory_beacon_cells` 2(도시 소유 비콘 둘레 여유). 계수표 칸 `territoryDisplay`(시뮬은 읽지 않음), 서버 `world.cities` 응답 `territoryDisplay`(live), 화면은 틀린 값·옛 서버면 출발값. 개발자 설정 칸 패널 "그 밖" 페이지에 저절로 선다.
  - 결정: 배율은 단위가 있어야 해서(서버 시험이 live 칸의 unit을 본다) 이 저장소 관례대로 천분율(2000‰ = 2배)로 뒀다. 값 자체는 지시 그대로(×2).
- 1432 "영향력 비율": 겹친 곳 주인 = 덮는 덩이 자리 가운데 거리 ÷ 영향력 반지름이 가장 작은 자리(claimAt과 같은 식, 같으면 도시 → 작은 ID). 뼈대를 국가가 아니라 이어진 덩이 단위로 셈한다. 그리기·누르기가 같은 함수.
- 1434 "도시소유의 비콘은 국가 및 도시의 최대 외곽선을 넓히는 용도": 서버가 꼭짓점 비콘을 보낸다(안개 = 내 국가·기준 도시를 앎·전체 보기). 화면은 기준 도시가 아는 도시인 비콘만, 기준 도시·같은 기준 도시 비콘끼리 거리와 상관없이 잇고 삼각형을 채운다 → 도시 원에서 비콘까지 외곽선이 밀려난다. 비콘 자리 영향력 = 기준 도시 원 반지름. 누르면 "<기준 도시> 지방".
- 1435: 받침 선·이름표 유지 + 팩 국가 프리셋 16색 다시 고름(두 기본 테마 판 위 비글자 대비 3 이상, 가장 가까운 쌍 OKLab 0.061 → 0.086, 나라마다 옛 색과 가장 가까운 새 색) + 비슷한 색 이웃 빗금(맞닿은 두 국가 색 OKLab < 0.12면 큰 ID 쪽 칠·범례 칩에 국가 색 위 글자 색 줄).
- 1436: 좁은 단계(37.5em = 600px 미만, `shell/layout.ts`)는 레이어를 고르면 판을 닫고, 중간·넓음은 열어 둔다.
- 범례 문구(`planet_territory_known`)를 새 규칙으로 고쳤다(ko·en).
- 판정(claimAt·비콘 놓기·지방)은 그대로 — ADR 두 곳에 적었다(D-544 미결).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/worldMap.ts` | `WorldMapBeacon`, `WorldTerritoryDisplay`, `TERRITORY_DISPLAY_START`, 응답 선택 칸 `beacons`·`territoryDisplay` |
| `packages/sim/src/tuningTerritoryDisplay.ts`(새), `tuning.ts`, `society/coefficients.ts`, `tuning.test.ts` | 설정 칸 ↔ 계수표 `territoryDisplay` |
| `content/core/tuning.json`, `nation_presets.json`, `manifest.json` | 칸 넷, 프리셋 색 16, core@95 |
| `apps/server/src/worldMap/reads.ts`, `knownCities.ts`, `app.ts`, `tuning/scope.ts` | 표시 값·꼭짓점 비콘(안개) 응답, live 경로 |
| `apps/game/src/map/territoryShapes.ts` | 설정 칸 값, 영향력 비율 주인, 덩이 단위 뼈대, 도시 소유 비콘 잇기, 맞닿은 국가 쌍 |
| `apps/game/src/map/territoryView.ts`(새) | 영토 보기 한 벌(모양 + 빗금 국가), 비슷한 색 문턱 |
| `apps/game/src/map/nationColor.ts` | OKLab 거리, 대비 내보내기 |
| `apps/game/src/map/CityOverlay.tsx`, `cityOverlay.css` | 받은 영토 보기, SVG 빗금 무늬 |
| `apps/game/src/map/usePlanetLayers.ts`, `PlanetLayerPicker.tsx`, `planetMap.css`, `PlanetMapScreen.tsx` | 영토 보기 한 번 셈, 범례 빗금, 좁은 화면 판 닫기 |
| `apps/game/src/map/territoryPick.ts` | 같은 주인 규칙, 비콘 → 기준 도시 |
| `apps/game/messages/{ko,en}.json` | 범례 문구 |
| 시험: `territoryShapes.test.ts`·`territoryPick.test.ts`·`territoryDraw.test.ts`·`territoryView.test.ts`(새)·`nationColor.test.ts`·`knownCities.test.ts`·`presets.test.ts`(프리셋 색 기대값) | |
| `e2e/planet-view.spec.ts`, `e2e/helpers/beacons.ts`(새), `e2e/helpers/wsCommands.ts` | 좁은 화면 판 닫힘·비콘 놓고 사진·1440 열린 판·빗금 |
| `docs/adr/…`, `docs/questions/2026-11-14-planet-ui-2.md` | 바뀜·질문 |

## 함께 바꿔야 하는 파일
- 주인 규칙: `territoryShapes.ts` `ownerAmong` 한 곳(그리기·누르기 공용). 판정 `claimAt`(`@terra/shared/territory`)의 비율식이 바뀌면 이것도 맞춘다(옮겨 적은 식).
- 설정 칸을 더하면 `tuningTerritoryDisplay.ts`·`TERRITORY_DISPLAY_START`·팩 `tuning.json`·`tuning/scope.ts`·화면 `territoryDisplayOf`를 같이.
- 국가 프리셋 색을 바꾸면 `nationColor.test.ts`(거리·대비)와 `territoryView.ts` 문턱 주석의 쌍 수.

## 건드리지 말 것
- 서버 칸 소속 `claimAt`·비콘 놓기·지방(D-544 미결 — 기획이 표시와 판정을 함께 정한다).

## 리셋 필요 여부
- **필요 없음**: DB 마이그레이션 없음, SIM·프로토콜 판 그대로. 팩 core@95(설정 칸 넷 더함, 국가 프리셋 색 바뀜)는 켤 때 그대로 읽힌다. 세력 정체성 색이 없는 국가는 새 프리셋 색으로 바로 보인다(`world.cities`가 조회마다 읽음).

## 미검증·TODO·알려진 문제
- 시험 세계에 이웃한 비슷한 색 국가가 없어 빗금 화면 시험은 `world.cities` 응답을 고쳐(도시 하나를 옮기고 두 국가 색을 빨강 둘로) 본다(실제 자료로는 Unknown).
- 1440 영토 이름표가 도시 이름표와 겹치는 곳이 있다(앞 줄기의 이름표 자리 규칙 그대로, 이번에 바꾸지 않음).
- 줄기 첫 WIP 커밋(90b43bbd76) 꼬리에 옛 형식 공동 작성자 줄이 남아 있다(이미 푸시됨, 고쳐 쓰지 않았다).

## 사용자 결정 대기
- 질문 1471(빗금 받는 쪽·문턱), 1472(비콘 둘레 여유) — `docs/questions/2026-11-14-planet-ui-2.md`.

## 확인
- Verified 단위 시험: `apps/game/src/map` 312개 통과(territoryShapes 17 — 영향력 비율 경계·비콘 외곽선·같은 기준 도시 비콘 삼각형·비콘 영향력, territoryPick 6, territoryView 2, territoryDraw 3, nationColor 4 — 프리셋 거리·대비), 서버 `knownCities.test.ts` 5·`presets.test.ts` 14·`tuning` 통과, sim `tuning.test.ts` 7.
- Verified `pnpm check`(TEST_DATABASE_URL): 시험 파일 705·시험 5,285개 가운데 `presets.test.ts` 1개 실패(프리셋 색 기대값) → 고친 뒤 그 파일 14개 통과. 마지막 전체 실행 결과는 아래 "마지막 검사".
- Verified `pnpm build`·`node scripts/check-pwa.mjs`·`pnpm check:bundle`: 통과(첫 화면 JS 109,644 B / 상한 131,416 B).
- Verified 화면 시험 `pnpm e2e e2e/planet-view.spec.ts e2e/play-map.spec.ts`: 43개 통과(11.3분). 비콘을 놓은 뒤 `world.cities` `beacons`에 그 비콘이 오는 것, 좁은 화면 판 닫힘, 1440 판 열림, 빗금 칠 + 무늬 정의, 범례 빗금 칩. 엔진 p95(헤드리스, 덧그림 포함) 4단계 2.2~2.9ms, 1단계 1.3~2.1ms.
- 사진(390 파스텔·다크 + 1440, `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/planet-ui-2-shots/`): `planet-layer-territory-stage4-390-*`(비콘으로 넓어진 칼루누이 영토), `planet-territory-hatch-390-*`(빗금), `planet-layer-territory-open-1440-pastel`(넓은 화면 열린 판).
