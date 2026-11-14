# 1차맵 UI 개편 — 고도 과장 ×12 고정, 레이어 접는 단추, 영토 = 도시 배후지 원의 합

- 일시: 2026-11-14 21:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-planet-view.md` "바뀜 (2026-11-14)", `docs/adr/2026-11-03-territory-layer.md` "바뀜 (2026-11-14)", `docs/adr/2026-11-11-city-catchment.md`, 질문 `docs/questions/2026-11-14-planet-ui.md`(1431~1436), 가지 `work/planet-ui`

## 한 일
- 사용자 요청(2026-11-14, 휴대폰 사진 둘) "1차맵 UI 개편" 세 가지:
  1. 고도 과장: 모두 ×12 고정(엔진 `PLANET_EXAGGERATION`, 1차맵·첫 접속 도시 고르기·행성 편집기 공통). 막대는 아래 판에서 빼 운영 메뉴(운영진 gm·admin·dev) 안 한 줄로.
  2. 레이어 메뉴: 늘 보이는 것은 한 줄 — [레이어 아이콘 + 지금 레이어 이름 ▾] · [이 2차맵으로 들어가기] · [내 위치]. 단추를 누르면 레이어 다섯·원자재·범례 판이 열리고, 다시 누르기·Esc·땅 누르기로 닫힌다.
  3. 영토: 도시마다 배후지 지금 반경 원, 국가마다 원들의 합, 다른 국가 원이 겹친 곳은 가장 가까운 도시(두 도시의 가운데)가 경계, 국가 색 반투명 칠 + 국가가 바뀌는 선만 테두리, 영토 레이어에서 국가 이름(겹치지 않게). 각진 껍질은 1차맵에서 뺐다. 누른 곳의 국가도 같은 규칙.
- 서버 `world.cities` 도시 줄에 `catchmentMilli`(배후지 지금 반경, 선택 칸)를 더했다. tRPC 조회라 프로토콜 판은 그대로.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/planet/planetEngine.ts`, `index.ts` | `PLANET_EXAGGERATION = 12`(엔진 기본값도) 내보내기 |
| `apps/game/src/map/PlanetMapScreen.tsx` | ×12, 막대를 운영 메뉴로, 레이어 접는 단추·판 여닫기(땅 누르면 닫힘), 껍질 넘기기 뺌 |
| `apps/game/src/start/StartCityMap.tsx` | 같은 ×12 |
| `apps/game/src/map/PlanetLayerPicker.tsx`, `mapIcons.tsx`, `planetMap.css` | 접는 단추(`PlanetLayerToggle`)·열리는 판, 레이어 아이콘, 판·단추·운영 메뉴 막대 모양 |
| `apps/game/src/map/territoryShapes.ts`(새) | 영토 모양 셈: 원 바탕·이긴 조각·테두리·이름표 자리, 주인 규칙 `territoryOwner` |
| `apps/game/src/map/territoryDraw.ts`(새) | 프레임마다 투영: 화면 밖·지평선 너머 건너뛰기, 꼭짓점 솎기, 국가 이름표 자리 |
| `apps/game/src/map/CityOverlay.tsx`, `cityOverlay.css` | 껍질·가리개 대신 새 영토 그리기와 국가 이름표 |
| `apps/game/src/map/territoryPick.ts` | 누른 곳의 국가 = 그린 영토와 같은 규칙 |
| `apps/game/src/map/usePlanetLayers.ts` | 새 `territoryAt` 호출 |
| `apps/game/messages/{ko,en}.json` | `planet_layer_toggle` 더함, `planet_territory_known` 문구 바꿈 |
| `packages/shared/src/worldMap.ts` | `WorldMapCity.catchmentMilli` |
| `apps/server/src/worldMap/reads.ts`, `apps/server/src/app.ts` | 도시마다 배후지 지금 반경(설정 칸 실효 값, 배후지 스위치 0이면 null), `milliPerRadian` 대체 값 |
| 시험: `territoryShapes.test.ts`·`territoryDraw.test.ts`(새), `territoryPick.test.ts`, `worldMap.test.ts`(옛 원 점 시험 뺌), `reads.db.test.ts`, `e2e/planet-view.spec.ts` | |
| `docs/adr/…`, `docs/questions/2026-11-14-planet-ui.md` | 바뀜·질문 |

## 함께 바꿔야 하는 파일
- 영토 주인 규칙을 바꾸면 `territoryShapes.ts`(그리기)와 `territoryPick.ts`(누르기)가 같은 함수를 쓰니 한 곳만 고친다.
- 배후지 반경 규칙(`@terra/shared/catchment` `catchmentRadiusMilli`)이 바뀌면 1차맵 영토도 따라간다(옮겨 적지 않았다).

## 건드리지 말 것
- 서버 칸 소속 판정(`@terra/shared/territory` `claimAt`)·비콘 규칙은 그대로다(질문 1433).
- `content/core/map_props.json`·2차맵 소품(`islet-remove` 줄기).

## 리셋 필요 여부
- 필요 없음: DB 마이그레이션·팩·SIM·프로토콜 판 그대로. 화면과 tRPC 조회 칸 하나(선택 칸)만 더했다.

## 미검증·TODO·알려진 문제
- (화면 시험 결과는 아래 "확인"에 적는다)
- 셋 이상 다른 국가 원이 한 점에서 얽히면 이긴 조각 밖 칠이 바탕 차례를 따른다(주인 규칙과 다를 수 있다 — 드물다, Assumed).
- 실제 휴대폰에서 프레임 시간은 재지 않았다(Unknown). 헤드리스 값은 아래.

## 사용자 결정 대기
- 질문 1431~1436(`docs/questions/2026-11-14-planet-ui.md`).

## 확인
