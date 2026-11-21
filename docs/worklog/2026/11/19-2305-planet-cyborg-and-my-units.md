# 1차맵 내 본캐릭 사이보그·전역 보유 유닛 위치 표시 및 내 부대 레이아웃

- 일시: 2026-11-19 23:05 (KST)
- 작업 도구: Antigravity
- 관련: `docs/adr/2026-11-07-play-flow.md`, `docs/adr/2026-11-15-unloaded-second-maps.md`, 커밋 `4731e30c`

## 한 일
- **서버 전역 내 유닛·이동 경로 조회 보강** (Verified):
  - `packages/shared/src/worldMap.ts`에 `WorldPosition.name`(사이보그 이름), `WorldTravel.routePoints`(1차맵 남은 이동 경로 좌표), `WorldMyUnit`·`WorldTravelsResponse.units`(행성 전역의 내 모든 유닛 목록) 선택 필드를 추가했습니다.
  - `apps/server/src/worldMap/travelReads.ts`와 `reads.ts`에서 메모리 안의 모든 띄운 2차맵(`world.maps`), 좌표 유닛(`coordinateUnits`), 진행 중인 이동(`travels`)을 DB 조회 없이 하나로 합쳐 본캐 사이보그·휴먼·사이보그 유닛·수호신·배의 실시간 위치와 이동 경로를 돌려줍니다.
- **1차맵 본캐 사이보그 비콘 & 내 유닛 핀·이동 경로 표시** (Verified):
  - `CityOverlay.tsx`·`cityOverlay.css`·`unitOverlay.ts`에서 본캐 사이보그(`.city-me`)를 도시 점과 겹치지 않게 위로 뜨는 **[본캐 + 사이보그 이름 + 바이저 아이콘 + 레이더 펄스 고리]** 비콘으로 업그레이드하고, 국가 이름표가 본캐 배너를 피해 배치되게 했습니다.
  - 띄운 2차맵·좌표 유닛·배·이동 중 유닛을 모두 `.city-away` 핀으로 표시하며(본캐와 같은 자리면 살짝 비켜 배치, 여러 유닛은 `×N` 부대 묶음), 이동 중인 본캐·유닛의 남은 경로를 점선 호와 목적지 표적으로 그립니다.
- **내 부대 위치 판 & 내 부대 위치 강조 레이아웃 추가** (Verified):
  - `PlanetUnitsPanel.tsx`·`planetUnits.css`를 추가해 본캐 사이보그 카드와 보유 유닛 목록(현재 위치·작업/정찰/이동 상태·`[위치]` 카메라 이동·`[2차맵]` 바로 들어가기)을 제공합니다.
  - 하단 조작 줄에 `[내 부대 (N)]` 단추를 두고, `PlanetLayerPicker.tsx` 레이어 판 안에도 **"내 부대 위치 강조"** 스위치를 넣어 배경 영토·도시를 가라앉히고 본캐·내 유닛·이동 경로만 맨 위에 강조하는 레이아웃 모드를 켤 수 있게 했습니다.
  - 모바일 390px에서 하단 단추 4개(`지형·내 부대·세력·전황·내 위치`)가 44px 터치 영역을 지키며 한 줄에 들어가도록 여백을 다듬었습니다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/worldMap.ts` | `WorldPosition.name`, `WorldTravel.routePoints`, `WorldMyUnit`, `WorldTravelsResponse.units` 추가 |
| `apps/server/src/worldMap/travelReads.ts` | 전역 내 유닛 수집(`units`) 및 이동 경로 좌표(`routePoints`) 계산 |
| `apps/server/src/worldMap/reads.ts` | `position()`에 사이보그 이름 포함, `createTravelReads`에 `maps`·`cyborgName` 연결 |
| `apps/game/src/map/mapIcons.tsx` | `cyborg`, `squad`, `unit`, `pin` 아이콘 추가 |
| `apps/game/src/map/useMyTravel.ts` | `travels`·`units` 반환 및 모든 내 유닛 이동 중 5초 갱신 |
| `apps/game/src/map/unitOverlay.ts` | 내 유닛 병합(`mergeMyUnits`), 이동 경로 투영(`projectMyRoutes`), 부대 묶음·본캐 회피 배치(`placeMyUnits`) |
| `apps/game/src/map/unitOverlay.test.ts` | 내 유닛 병합·경로 투영·부대 묶음 단위 시험 |
| `apps/game/src/map/CityOverlay.tsx` | 본캐 비콘, 전역 내 유닛 핀, 이동 경로·목적지 표적, 강조 레이아웃 연동 |
| `apps/game/src/map/cityOverlay.css` | 본캐 레이더 핀, 내 유닛 핀·묶음·라벨, 이동 경로, 내 부대 강조 레이아웃 스타일 |
| `apps/game/src/map/PlanetUnitsPanel.tsx` | 내 본캐릭·보유 유닛 위치 판 및 하단 `[내 부대]` 단추 |
| `apps/game/src/map/planetUnits.css` | 내 부대 판·레이어 강조 토글 토큰 스타일 |
| `apps/game/src/map/PlanetLayerPicker.tsx` | 레이어 판에 "내 부대 위치 강조" 스위치 추가 |
| `apps/game/src/map/PlanetMapScreen.tsx` | 내 부대 판·강조 모드·유닛 초점·본캐/유닛 핀 클릭 연동 |
| `apps/game/src/map/planetMap.css` | 모바일 390px 하단 조작 줄 4버튼 한 줄 맞춤 여백 조정 |
| `apps/game/messages/ko.json` | 내 부대·본캐·유닛 위치 한국어 문구 추가 |
| `apps/game/messages/en.json` | 위 항목 영어 문구 동시 추가 |

## 함께 바꿔야 하는 파일
- `apps/game/messages/ko.json`·`apps/game/messages/en.json`은 키를 항상 함께 유지합니다.
- `e2e/play-map.spec.ts`가 확인하는 `.planet-go-me`, `.city-away[data-away-unit]`, `aria-label`의 `#<ID>` 형식을 유지해야 합니다.

## 건드리지 말 것
- `e2e/planet-view.spec.ts`의 `[data-layer-option]` 5개 계약(지형·기후·고도·자원·영토)을 유지하기 위해 내 부대 강조는 별도 스위치와 `[내 부대]` 단추로 분리했습니다.

## 미검증·TODO·알려진 문제
- 로컬 개발 DB(`terra_dev`)의 `dev` 계정은 현재 본캐 사이보그 1기만 보유하고 있어, 다수 보유 유닛(휴먼 2·이동 중 사이보그 유닛 1·배 1)과 이동 경로 표시는 Playwright에서 `world.travels` 응답에 유닛을 주입해 데스크톱(1280×800)·모바일(390×844) 실브라우저에서 검증했습니다(Verified).
- `e2e/play-map.spec.ts` 전체 E2E 스위트는 미실행입니다.

## 사용자 결정 대기
- 로컬에 쌓인 4개 커밋(모바일 스탯창 수정, 2차맵 이동·3D 보강, 1차맵 4X 개편, 이번 본캐·내 유닛 위치 표시)을 `origin/main`에 한 번에 푸시할지 확인 대기.
