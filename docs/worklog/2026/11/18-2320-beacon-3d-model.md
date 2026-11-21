# 영토 비콘(`territory_beacon`) 전용 3D 모델 추가

- 일시: 2026-11-18 23:20 (KST)
- 작업 도구: Antigravity
- 관련: ADR `2026-11-08-building-art.md`, `2026-11-03-territory-layer.md`

## 한 일
- 사용자 지적: 건물 편집기 "2차맵 모습"에서 `territory_beacon`에 전용 모델이 없어 일반 집(`house`, 작은 집 4채)으로 보이던 문제를 수정했다.
- `beacon` 전용 로우폴리 모델(`packages/engine/src/buildings/buildingKindsMilitary.ts`)을 새로 만들었다:
  - 2단 돌 기단·앞쪽 계단·돌 길, 네 귀 경계 표지석 4기(국가 색이 있으면 꼭대기에 표시), 소나무 기둥으로 보강한 8각 돌 탑신(재료 `pine_log 4 · stone 4` 반영), 국가 색 띠, 4기둥 철제 랜턴실과 8각 발광 결정(낮에는 청회 유리, 밤에는 금빛 발광, 멈춤 상태에서는 어두워짐), 사각뿔 지붕과 금 끝 신호 첨탑(3×3 기준 51조각, 높이 14.4m).
- 겉모습 이름표(`FACILITY_LOOK_MODELS`)·엔진 매핑(`FACILITY_ART`)·도시 무리(`GROUP_OF_MODEL`, `military`)·편집기 모델 선택 문구(`ko`/`en`)·콘텐츠 팩(`core@123`, `territory_beacon.look.model = "beacon"`)을 함께 맞췄다. `territory_beacon`은 1차맵 시설이므로 `footprint`는 비워 두었다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/facilityLook.ts` | `FACILITY_LOOK_MODELS` 끝에 `"beacon"` 추가 |
| `packages/engine/src/buildings/buildingKindsMilitary.ts` | `beacon` 3D 모델 구현(600줄 초과를 피하려고 `buildingKinds.ts`에서 분리) |
| `packages/engine/src/buildings/buildingKinds.ts` | `mainRectOf`와 `KIND_MODELS`에 `beacon` 연결 |
| `packages/engine/src/buildings/buildingLook.ts` | `FACILITY_ART`에 `territory_beacon: "beacon"` 추가 |
| `packages/engine/src/buildings/buildingModels.test.ts` | `beacon` 발광·금 첨탑·`artKindOf("territory_beacon")` 시험 추가 |
| `apps/game/src/map/city/cityRows.ts` | `GROUP_OF_MODEL`에 `beacon: "military"` 추가 |
| `apps/game/src/editor/buildings/buildingLookText.ts` | `MODEL_TEXT`에 `beacon` 메시지 키 연결 |
| `apps/game/messages/ko.json`, `en.json` | `dev_buildings_look_model_beacon` 한국어·영어 문구 추가 |
| `content/core/facilities.json`, `manifest.json` | `territory_beacon`에 `look.model: "beacon"` 지정, 팩 판 `122 → 123` |
| `docs/worklog/2026/11/18-2320-beacon-3d-model.md`, `docs/WORKLOG.md` | 이 기록과 자동 생성 목차 |

## 함께 바꿔야 하는 파일
- `FACILITY_LOOK_MODELS`(`packages/shared/src/facilityLook.ts`)에 새 모델을 더할 때는 `buildingKinds.ts`, `buildingLookText.ts`, `ko.json`/`en.json`, `cityRows.ts`(`GROUP_OF_MODEL`)를 함께 고쳐야 한다.

## 건드리지 말 것
- `content/core/facilities.json`의 `territory_beacon`에는 `footprint`를 넣지 않는다(1차맵 전용 시설이라 `footprint`가 있으면 2차맵 건설 허용으로 뜻이 바뀐다).

## 미검증·TODO·알려진 문제
- `pnpm check` 통과(Verified: 포맷·타입 검사·oxlint 경고/오류 0·모듈 경계·파일 크기·다국어·대비·콘텐츠 스키마, 단위 테스트 701파일 5,501건 통과 — `TEST_DATABASE_URL`이 없어 DB 통합 테스트 90파일 373건은 건너뜀).
- `pnpm --filter @terra/game build` + `check-pwa.mjs` + `check-bundle.mjs` 통과(Verified, 첫 화면 JS 109,877B / 상한 131,416B).
- `BuildingPreview`를 Chrome(SwiftShader)으로 직접 띄워 낮·밤·국가 색 3가지 화면을 렌더링해 확인함(Verified, 3×3 기준 51조각, 높이 14.4m).
- 전체 E2E(`e2e/buildings.spec.ts`)는 실행하지 않았다(미실행).

## 사용자 결정 대기
- 없음.
