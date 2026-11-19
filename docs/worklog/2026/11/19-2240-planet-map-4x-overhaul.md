# 1차맵 4X 전략 지도 개편 — 국가 이름·세력 전쟁 전선·지형 셰이더·레이어 레이아웃

- 일시: 2026-11-19 22:40 (KST)
- 작업 도구: Antigravity
- 관련: `docs/adr/2026-11-07-planet-view.md`, `docs/adr/2026-11-07-play-flow.md`

## 한 일
- **국가 이름표 누락 수정 및 4X 국가 배너 개선** (Verified):
  - 기존 `CityOverlay.tsx`에서 `emphasis`(영토 레이어)일 때만 국가 이름표를 계산하던 제한을 풀어, 지형·영토·고도·기후·자원 모든 레이어에서 국가 이름표가 항상 표시되게 바꿨습니다.
  - `territoryDraw.ts` `placeLabels`에 화면 가장자리 안전 여백 보정(위·아래 HUD 회피)과 대체 기준점(수도·주요 도시) 탐색을 더해 화면 가장자리에 걸친 국가 이름도 사라지지 않게 했습니다.
  - 국가 문양(`NationEmblem`), 규모별 크기 위계(`major`/`medium`/`minor`), 교전 배지(`⚔`), 높은 대비의 전략 배너 스타일을 적용하고, 웹 글꼴 로드·초기 레이아웃 완료 후 폭을 다시 재도록 했습니다.
  - 화면 바깥 도시 마커를 숨기고 `.city-overlay`에 `overflow: clip`을 적용해 바깥 요소 포커스·클릭 시 오버레이가 밀리는 버그를 막았습니다.
- **삼국지·4X 세력 전쟁·외교 시각화 및 천하 정세 판 추가** (Verified):
  - `packages/shared/src/worldMap.ts`와 `apps/server/src/worldMap/diplomacyReads.ts`·`reads.ts`를 확장해 `faction_wars`(전쟁·불가침), `war_outcomes`(진행 중 약탈·점령/최근 교전), 세력 체제·종주국·도시 수·인구·발전도를 `world.cities`에 선택 필드로 실었습니다(하위 호환 유지).
  - `warOverlay.ts`와 `CityOverlay.tsx`에서 전쟁 중인 국가의 최단 국경 도시를 잇는 곡선 전선 호, 중앙 교전 배지(`⚔`), 맞닿은 전쟁 국경 강조선, 불가침·봉신 연결선, 수도 황금 성채 배지, 수도·선택 도시 우선 이름표 배치를 그립니다.
  - `PlanetWarPanel.tsx`("천하 정세 · 세력 판도")를 추가해 진행 중인 전쟁 목록(`[전선 보기]`로 전선 중앙 카메라 이동), 불가침 조약, 도시 수·인구 순 세력 판도(국가 선택 시 수도로 이동 및 영토 강조)를 제공합니다.
- **1차맵 GPU 지형·해안선·하천·기후·고도 셰이더 고도화** (Verified):
  - `packages/engine/src/planet/planetTileShader.ts`를 분리해 2×2 이웃 표본 보간으로 육지 바이옴과 해수면을 자연스럽게 섞고, 타일 좌표 기반 미세 굴곡으로 직각 해안선·호수 계단을 유기적인 해안선으로 다듬었습니다.
  - 대각선 하천 다리 보간으로 끊기던 점선 강을 이어지는 물줄기로 바꾸고, 고산 암석·설산·지형 기복 음영을 보강했습니다.
  - 기후 레이어에 부드러운 기온·습도 보간과 10°C 등온선을, 고도 레이어에 주·보조 등고선과 해저 수심 등고선을, 영토·자원 레이어에 전략 아틀라스 바탕과 선명한 해안선을 더했습니다.
- **고도·기후·자원·영토 레이어 레이아웃 및 도시 판 개편** (Verified):
  - `PlanetLayerPicker.tsx`에 아이콘+이름 5열 대칭 레이어 카드(`지형·기후·고도·자원·영토`, 모바일 390px 포함 44px 이상 터치 영역), 기후 기온 스펙트럼 카드(`CLIMATE_TEMP_RAMP`), 고도 등고선 범례 카드, 원탭 원자재 칩(기존 `#planet-material` select 유지), 클릭 시 수도로 이동하는 국가 문양 범례 칩을 넣었습니다.
  - `PlanetCityPanel.tsx`에 국가 문양, 수도·등급·인구·발전도 표시와 교전·점령 경고를 추가했습니다.
  - 넓은 화면에서 하단 HUD를 왼쪽 아래 전략 카드 형태로 정리하고, 레이어/전황 판이 열려 있을 때 기본 안내 줄을 숨겨 화면을 깔끔하게 정리했습니다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/worldMap.ts` | 1차맵 외교 관계(`WorldMapRelation`), 도시 점령 상태(`WorldMapCityOccupation`), 세력·도시 요약 선택 필드 추가 |
| `apps/server/src/worldMap/diplomacyReads.ts` | 아는 세력·도시 범위의 `faction_wars`·`war_outcomes` 읽기 도우미 분리 |
| `apps/server/src/worldMap/reads.ts` | `world.cities`에 세력 체제·종주국·인구·발전도·외교 관계·점령 상태 포함 |
| `packages/engine/src/planet/layerColors.ts` | 기후 기온 스펙트럼 색 띠(`CLIMATE_TEMP_RAMP`) 단일 원본 추가 |
| `packages/engine/src/planet/index.ts` | `CLIMATE_TEMP_RAMP` 내보내기 |
| `packages/engine/src/planet/planetTileShader.ts` | 2×2 부드러운 지형·유기적 해안선·연속 하천·등온선·등고선·전략 아틀라스 GLSL 셰이더 모듈 |
| `packages/engine/src/planet/planetMaterials.ts` | 조각 셰이더를 `planetTileShader.ts`로 위임해 경량화 |
| `apps/game/src/map/mapIcons.tsx` | 지형·기후·고도·자원·영토·전쟁(교차 검)·왕관 아이콘 추가 |
| `apps/game/src/map/territoryShapes.ts` | 국가 쌍이 붙은 국경 조각(`dividerEdges`) 함께 반환 |
| `apps/game/src/map/territoryView.ts` | `EMPTY_TERRITORY_VIEW`에 `dividerEdges` 초기화 |
| `apps/game/src/map/territoryDraw.ts` | 전쟁 국경선 투영(`warDividers`), 가장자리 국가 이름표 안전 보정 및 대체 기준점 지원 |
| `apps/game/src/map/warOverlay.ts` | 전쟁 전선 호·교전 배지·불가침·봉신 투영, 수도·선택 도시 우선 이름표 배치 |
| `apps/game/src/map/warOverlay.test.ts` | 전선 호·교전 배지·우선순위 이름표 단위 시험 |
| `apps/game/src/map/CityOverlay.tsx` | 모든 레이어 국가 이름표 표시, 문양·전선 호·교전 배지·수도 성채·화면 밖 마커 숨김 |
| `apps/game/src/map/cityOverlay.css` | 4X 국가 배너, 이중 국경선, 전선 애니메이션, 교전 배지, 수도·점령 스타일(`overflow: clip`) |
| `apps/game/src/map/PlanetLayerPicker.tsx` | 5열 아이콘 레이어 카드, 기후·고도·자원·영토·지형 범례 및 국가 클릭 이동 |
| `apps/game/src/map/PlanetWarPanel.tsx` | 천하 정세·세력 판도 판 및 전황 단추 |
| `apps/game/src/map/planetWar.css` | 천하 정세·세력 판도 판 토큰 스타일 |
| `apps/game/src/map/PlanetCityPanel.tsx` | 국가 문양·수도 배지·등급/인구/발전도·교전·점령 경고 표시 |
| `apps/game/src/map/usePlanetLayers.ts` | 영토 범례에 국가 문양·도시 수·전쟁 여부 전달 |
| `apps/game/src/map/PlanetMapScreen.tsx` | 전황 판·국가 강조·전선 이동·지형 레이어 영토 칸 안내 연동 |
| `apps/game/src/map/planetMap.css` | 5열 대칭 레이어 바, 떠 있는 전략 카드 레이아웃, 44px 터치 영역 및 범례 스타일 |
| `apps/game/messages/ko.json` | 1차맵 기후·고도·전황·세력 판도·도시 정보 한국어 문구 추가 |
| `apps/game/messages/en.json` | 위 항목 영어 문구 동시 추가 |

## 함께 바꿔야 하는 파일
- `apps/game/messages/ko.json`과 `apps/game/messages/en.json`은 메시지 키를 항상 함께 맞추고 Paraglide 컴파일을 돌려야 합니다.
- `packages/engine/src/planet/layerColors.ts`의 `CLIMATE_TEMP_RAMP`·`ELEVATION_LAND_RAMP`를 바꾸면 `planetTileShader.ts`의 `temperatureColor`·등고선 기준과 범례가 함께 맞물립니다.

## 건드리지 말 것
- `packages/planet/` 생성기·타일 이진 형식은 바꾸지 않았습니다(`docs/PROTECTED.md`).
- `e2e/planet-view.spec.ts`가 검증하는 `.planet-layer-toggle`, `.planet-layer-sheet`, `[data-layer-option]`, `#planet-material`, `.city-overlay[data-emphasis="territory"]`, `.city-area-label[data-shown="true"]` 계약을 유지합니다.

## 미검증·TODO·알려진 문제
- `e2e/planet-view.spec.ts` 전체 스위트는 이번 묶음에서 실행하지 않았고(미실행), 대신 데스크톱(1280×800)·모바일(390×844) 실브라우저 Playwright 스크립트로 지형·전황·영토·고도·기후·자원·도시 판과 모바일 오버플로·터치 영역을 직접 눈으로 확인했습니다(Verified).
- 현재 로컬 개발 DB(`terra_dev`)는 초기 평화 상태(`faction_wars` 0건)라, 전선 호·교전 배지·전황 판 시각 확인은 Playwright에서 `world.cities` 응답에 전쟁 3건·불가침 1건·점령 1건을 주입해 검증했습니다(Verified). 실제 DB 쿼리(`loadFactionRelations`·`loadCityOccupations`)는 스키마 정합성과 서버 타입검사로 확인했습니다.

## 사용자 결정 대기
- 로컬에 쌓인 3개 커밋(모바일 스탯창 수정, 2차맵 이동·3D 모델링 보강, 이번 1차맵 4X 개편)을 `main`에 함께 푸시할지 확인 대기.
