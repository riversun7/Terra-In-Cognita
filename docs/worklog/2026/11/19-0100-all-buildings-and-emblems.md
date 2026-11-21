# 전체 건물 3D 모델 재제작 및 국가 시그니처 컬러·깃발 문양 반영

- 일시: 2026-11-19 01:00 (KST)
- 작업 도구: Antigravity
- 관련: ADR `2026-11-08-building-art.md`, `2026-11-10-nation-editor.md`, `docs/worklog/2026/11/18-2320-beacon-3d-model.md`

## 한 일
- **국가 시그니처 컬러·깃발 문양(`NationEmblemView`) 연동**:
  - `packages/shared/src/worldMap.ts`, `apps/server/src/worldMap/reads.ts`: `world.cities` 응답의 `WorldMapFaction`에 `emblem`과 시그니처 `color`를 함께 실어 보내도록 확장했다(`faction_identities`의 `emblem_shape/division/charge/scheme/sha256` 및 `emblemOfCode` 사용).
  - `packages/engine/src/buildings/emblemTexture.ts`: `NationEmblemView`를 깃발(`256×160`)·배너(`192×192`) `CanvasTexture`로 합성·캐시하고, Node 테스트 환경(`document` 없음)에서는 안전하게 `null`을 반환한다.
  - `packages/engine/src/buildings/buildingParts.ts`, `buildingModels.ts`, `buildingView.ts`, `buildingLook.ts`, `buildingPalette.ts`: `accentColor`·`emblem`과 `EmblemMount`(깃발·수직 배너)를 모델 번들(`buildingModelBundle`)과 인스턴스 렌더러(`BuildingView`)에 연결했다.
  - `apps/game/src/map/buildingLooks.ts`, `apps/game/src/editor/buildings/BuildingLookSection.tsx`: 2차맵 건물 배치 시 소속 세력 시그니처 컬러와 엠블럼을 전달하고, `/dev/buildings` 편집기 미리보기(`색 1~6`)에도 시그니처 컬러·문양 견본 6종을 연결했다.
- **전체 건물 3D 모델 31종 재제작 및 시설 크기·매핑 정비**:
  - `packages/shared/src/facilityLook.ts` 끝에 전용 모델 10종(`grand_warehouse`, `logistics`, `lodging`, `wall`, `shipyard`, `trade_dock`, `goods_exchange`, `fx_exchange`, `unit_exchange`, `stock_exchange`)을 추가했다(총 31종).
  - `packages/engine/src/buildings/` 아래 영역별 파일 7개(`buildingKindsGather.ts`, `buildingKindsProcess.ts`, `buildingKindsStorage.ts`, `buildingKindsCivic.ts`, `buildingKindsTransport.ts`, `buildingKindsCommerce.ts`, `buildingKindsMilitary.ts`)와 `buildingKinds.ts`에서 31종 모델을 모두 새로 구성했다.
  - 특히 `government`에는 시그니처 컬러 지붕 띠·정면 박공 문장·현관 양옆 수직 배너·대형 광장 국기 게양대를, `beacon`에는 탑신 사방 배너·신호등·깃발을 배치해 국가 정체성이 바로 드러나게 했다.
  - `content/core/facilities.json` (`core@124`): 새 전용 `look.model`을 각 시설에 연결하고 `temple`(4×4), `biotech_lab`(3×3), `government_hall`(4×4), `shipyard`(4×4), `goods_exchange`(4×4) 발자국을 조정했다(`fishing_spot` 3×3·`city_wall` 4×1·`territory_beacon` footprint 없음 유지).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/facilityLook.ts`, `worldMap.ts` | 전용 모델 이름 10종 추가, `WorldMapFaction.emblem` 필드 추가 |
| `apps/server/src/worldMap/reads.ts` | `world.cities` 세력 응답에 `color`·`emblem` 채우기 |
| `apps/server/src/facilities/npcSeed.test.ts` | `government_hall` 4×4 크기 변경에 맞춰 배치 기대치 수정 |
| `packages/engine/src/buildings/emblemTexture.ts` | 국가 문양 깃발·배너 캔버스 텍스처 생성기 추가 |
| `packages/engine/src/buildings/buildingLook.ts`, `buildingPalette.ts`, `buildingParts.ts`, `buildingModels.ts`, `buildingView.ts`, `buildingPreview.ts` | 시그니처 컬러(`accentColor`)·문양(`emblem`)·`EmblemMount` 파이프라인 및 공통 조형 도우미(`steps`, `banner`, `tree`, `lantern`, `crane`) 추가 |
| `packages/engine/src/buildings/buildingKinds*.ts` | 7개 영역 파일 + 레지스트리로 31종 로우폴리 건물 모델 재제작 |
| `packages/engine/src/buildings/buildingModels.test.ts` | 31종 경계(`4×1`·`1×4` 포함)·시그니처 컬러·문양 걸이 검증 추가 |
| `apps/game/src/map/buildingLooks.ts`, `city/cityRows.ts`, `city/cityRows.test.ts` | 세력 색/문양 전달 및 10종 모델 무리(`GROUP_OF_MODEL`) 매핑·시험 갱신 |
| `apps/game/src/editor/buildings/BuildingLookSection.tsx`, `buildingLookText.ts`, `apps/game/messages/{ko,en}.json` | 편집기 시그니처 색·문양 견본 미리보기 및 모델 10종 다국어 라벨 추가 |
| `content/core/facilities.json`, `content/core/manifest.json` | 10개 시설 `look.model` 지정, 5개 시설 `footprint` 조정, 팩 판 `123 → 124` |
| `docs/worklog/2026/11/19-0100-all-buildings-and-emblems.md`, `docs/WORKLOG.md` | 이 기록과 자동 생성 목차 |

## 함께 바꿔야 하는 파일
- `FACILITY_LOOK_MODELS`(`packages/shared/src/facilityLook.ts`)에 모델을 추가할 때는 `buildingKinds.ts`, `buildingLookText.ts`, `ko.json`/`en.json`, `cityRows.ts`를 함께 수정해야 한다.

## 건드리지 말 것
- `content/core/facilities.json`의 `territory_beacon`에는 `footprint`를 추가하지 않는다(1차맵 전용). `fishing_spot`(3×3)·`city_wall`(4×1) 규격도 서버 배치/연결 로직(`water.test.ts`, `cityWalls.ts`)과 묶여 있으므로 임의로 바꾸지 않는다.

## 미검증·TODO·알려진 문제
- `pnpm check` 정적 검사(Verified: `format:check`, `typecheck`, `lint` 경고/오류 0, `check:boundaries`, `check:size`, `check:i18n`, `check:contrast`, `check:content --no-compat`)와 건물·시설 단위 테스트(`buildingModels.test.ts`, `buildingView.test.ts`, `npcSeed.test.ts`, `cityRows.test.ts`, `buildingLooks.test.ts`) 통과. 전체 `vitest run` 병렬 실행 시 CPU 경합으로 시간 초과/지연이 났던 5개 파일(`secondMapTerrain.test.ts`, `metrics.test.ts`, `generate.test.ts`, `placement.test.ts`, `seams.test.ts`)도 `vitest run --maxWorkers=2`로 5파일 33건 모두 통과 확인함(단, `TEST_DATABASE_URL` 미설정으로 DB 통합 테스트는 건너뜀).
- `pnpm --filter @terra/game build` + `check-pwa.mjs` + `check-bundle.mjs` 통과(Verified, 첫 화면 JS 110,300 B / 상한 131,416 B).
- `BuildingPreview`를 Chrome(SwiftShader)으로 띄워 30종(낮/밤, 국가 시그니처 컬러·문양 3종 포함) 시트 4장 렌더링 시각 확인함(Verified).
- 전체 E2E(`e2e/buildings.spec.ts`)는 실행하지 않았다(미실행).

## 사용자 결정 대기
- 없음.
