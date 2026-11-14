# 1차맵 UI 개편 — 고도 과장 ×12 고정, 레이어 접는 단추, 영토 = 도시 배후지 원의 합

- 일시: 2026-11-14 21:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-planet-view.md` "바뀜 (2026-11-14)", `docs/adr/2026-11-03-territory-layer.md` "바뀜 (2026-11-14)", `docs/adr/2026-11-11-city-catchment.md`, 질문 `docs/questions/2026-11-14-planet-ui.md`(1431~1437), 가지 `work/planet-ui`

## 한 일
- 사용자 요청(2026-11-14, 휴대폰 사진 둘) "1차맵 UI 개편" 세 가지:
  1. 고도 과장: 모두 ×12 고정(엔진 `PLANET_EXAGGERATION`, 1차맵·첫 접속 도시 고르기·행성 편집기 공통). 막대는 아래 판에서 빼 운영 메뉴(운영진 gm·admin·dev) 안 한 줄로.
  2. 레이어 메뉴: 늘 보이는 것은 한 줄 — [레이어 아이콘 + 지금 레이어 이름 ▾] · [이 2차맵으로 들어가기] · [내 위치]. 단추를 누르면 레이어 다섯·원자재·범례 판이 열리고, 다시 누르기·Esc·땅 누르기로 닫힌다.
  3. 영토: 도시마다 배후지 지금 반경 원, 국가마다 원들의 합, 다른 국가 원이 겹친 곳은 가장 가까운 도시(두 도시의 가운데)가 경계, 국가 색 반투명 칠 + 국가가 바뀌는 선만 테두리, 영토 레이어에서 국가 이름(겹치지 않게). 각진 껍질은 1차맵에서 뺐다. 누른 곳의 국가도 같은 규칙.
- 서버 `world.cities` 도시 줄에 `catchmentMilli`(배후지 지금 반경, 선택 칸)를 더했다. tRPC 조회라 프로토콜 판은 그대로.
- 추가 요청(같은 날, 통합 세션 경유): 국가 고유 색. `world.cities` `factions[].color` = 세력 정체성 색 > 팩 국가 프리셋 색. 화면은 style CSS 변수(`--nation`·`--nation-ink`·`--nation-halo`)로 영토·도시 점·이름표·범례에. 글자는 밝기로 고른 검정/흰색 번짐, 국가 경계 선은 판색 받침 위에.

- 질문 1437 사용자 답(같은 날, 원문 "도시배후지는 그대로 하거나 더 키워도 좋다. 그런데 도시 사이에 빈공간이 있어 단절되어있다. 국가영토는 더 넓게 도시사이도 모두 포함하는 넓은 범위로 해달라."): 국가 영토 = 도시 원 + 12칸([임시]) 안 같은 국가 도시 사이 띠·삼각형, 겹친 곳은 가장 가까운 도시(가운데) 경계. 접평면 격자 마칭 스퀘어로 국가 덩이 둘레 고리를 찾아 그린다. 화면에서 12px보다 작은 국가는 둥근 표시. main(0256f25abc)을 먼저 합쳤다(작업 기록 목차 충돌만, 다시 만듦).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/planet/planetEngine.ts`, `index.ts` | `PLANET_EXAGGERATION = 12`(엔진 기본값도) 내보내기 |
| `apps/game/src/map/PlanetMapScreen.tsx` | ×12, 막대를 운영 메뉴로, 레이어 접는 단추·판 여닫기(땅 누르면 닫힘), 껍질 넘기기 뺌 |
| `apps/game/src/start/StartCityMap.tsx` | 같은 ×12 |
| `apps/game/src/map/PlanetLayerPicker.tsx`, `mapIcons.tsx`, `planetMap.css` | 접는 단추(`PlanetLayerToggle`)·열리는 판, 레이어 아이콘, 판·단추·운영 메뉴 막대 모양 |
| `apps/game/src/map/territoryShapes.ts`(새) | 영토 모양 셈: 국가 뼈대(도시·12칸 안 줄·삼각형) 덮임, 주인 규칙 `territoryOwner`(가장 가까운 도시), 마칭 스퀘어 고리·국가 경계 받침·이름표 자리 |
| `apps/game/src/map/territoryDraw.ts`(새) | 프레임마다 투영: 화면 밖·지평선 너머 건너뛰기, 고리 점 솎기, 작게 보이는 국가 둥근 표시, 국가 이름표 자리 |
| `apps/game/src/map/CityOverlay.tsx`, `cityOverlay.css` | 껍질·가리개 대신 새 영토 그리기와 국가 이름표 |
| `apps/game/src/map/territoryPick.ts` | 누른 곳의 국가 = 그린 영토와 같은 규칙 |
| `apps/game/src/map/usePlanetLayers.ts` | 새 `territoryAt` 호출 |
| `apps/game/messages/{ko,en}.json` | `planet_layer_toggle` 더함, `planet_territory_known` 문구 바꿈 |
| `packages/shared/src/worldMap.ts` | `WorldMapCity.catchmentMilli`, `WorldMapFaction.color`, `NATION_COLOR_PATTERN` |
| `apps/game/src/map/nationColor.ts`(새), `PlanetCityPanel.tsx` | 국가 색 CSS 변수·글자 대비, 도시 판 점 |
| `apps/server/src/worldMap/reads.ts`, `apps/server/src/app.ts` | 도시마다 배후지 지금 반경(설정 칸 실효 값, 배후지 스위치 0이면 null), `milliPerRadian` 대체 값, 국가 색(정체성 > 프리셋) |
| 시험: `territoryShapes.test.ts`·`territoryDraw.test.ts`·`nationColor.test.ts`(새), `territoryPick.test.ts`, `worldMap.test.ts`(옛 원 점 시험 뺌), `reads.db.test.ts`, `e2e/planet-view.spec.ts` | |
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
- 잇기 상한 12칸은 [임시](설정 칸 `city_catchment_search_cells` 출발값과 같은 값, 보기 상수 `CORRIDOR_CELLS`). 설정 칸이 바뀌어도 따라가지 않는다.
- 영토 셈은 도시 자료가 바뀔 때 기기에서 한 번(국가 16·도시 50 78ms, Node 단위 시험 — 휴대폰은 더 걸릴 수 있다, Unknown).
- 실제 휴대폰에서 프레임 시간은 재지 않았다(Unknown). 헤드리스 값은 아래.

## 사용자 결정 대기
- 질문 1431~1437(`docs/questions/2026-11-14-planet-ui.md`).

## 확인
- Verified `pnpm check`(TEST_DATABASE_URL): 통과 — 시험 파일 700·시험 5,262개.
- Verified `pnpm build`·`node scripts/check-pwa.mjs`·`pnpm check:bundle`·`pnpm check:docs origin/main`: 모두 통과.
- Verified 화면 시험 `pnpm e2e e2e/planet-view.spec.ts e2e/play-map.spec.ts`: 40개 통과(10.1분). 마지막 이름표 수정 뒤 `planet-view.spec.ts --grep 레이어` 8개 다시 통과.
  - 고도 과장: 플레이어 `data-engine-exaggeration` 12, 막대 없음. 운영진(dev·admin)은 운영 메뉴 안 막대가 ×12에서 시작, ×1 → ×20 그림 차이 dev 0.25·admin 0.83(잡음 0.00, 5단계 처음 보기). 카메라·누르기·구름·가까이 보기: 확대 단계·항성계·2차맵 들어가기 시험(같은 spec)이 ×12에서 그대로 통과.
  - 영토: 3단계 → 4단계에서 칠한 영토 안 점(SVG isPointInFill)을 누르면 "영토: <국가>", 땅을 누르면 레이어 판이 닫힘. 4단계 그린 원 반지름 약 114px. 범례 국가 칩 색이 모두 서로 다른 `#rrggbb`.
  - 프레임 시간(헤드리스 SwiftShader, 덧그림 포함 엔진 p95): 4단계 2.5~3.5ms, 1단계(끌며) 1.2~2.0ms. 시험 세계는 국가 4곳·도시 15곳만 알려진다 — 국가 16·도시 50은 단위 시험(셈 100ms 상한, 실제 수 ms)으로만 봤다(Assumed: 프레임 몫은 도시 수에 비례, 화면 밖 도시는 건너뛴다).
  - 시험 세계 도시는 사람이 적어 배후지 반경이 최소 1칸이다: 1단계에서는 원이 1px 미만이라 그리지 않고(그린 도시 0), 3단계에서도 도시 표시에 가린다(질문 1437). 4·5단계에서 칠·테두리가 또렷하다.
- 사진(390, 파스텔·다크, `E2E_SHOTS_DIR`): `planet-globe-390-*`(지형 행성 전체), `planet-layer-collapsed-390-*`(접힌 단추), `planet-layer-territory-open-390-*`(열린 판 + 영토 범례), `planet-layer-territory-390-*`·`planet-layer-territory-stage4-390-*`(영토·국가 이름·국가 색).
- 단위 시험(Verified): `territoryShapes.test.ts` 11, `territoryDraw.test.ts` 3, `territoryPick.test.ts` 3, `nationColor.test.ts` 3, `reads.db.test.ts` 4(배후지 반경·국가 색 포함).

### 확인 (질문 1437 답 반영 뒤, main 0256f25abc 합친 뒤)
- Verified `pnpm check`(TEST_DATABASE_URL): 통과 — 시험 파일 704·시험 5,275개. `pnpm build`·`check-pwa`·`check:bundle`·`check:docs origin/main` 통과.
- Verified 화면 시험 `planet-view.spec.ts` + `play-map.spec.ts` 40개 통과(10.3분), 둥근 표시 12px로 바꾼 뒤 "레이어" 8개 다시 통과.
  - 3단계에서 바로 영토 안을 눌러 "영토: <국가>"(같은 국가 도시가 띠로 이어진 칠, 그린 덩이 3, 가장 작은 덩이 화면 반지름 36px).
  - 1단계(행성 전체): 덩이는 12px보다 작아 고리 대신 국가 4곳 둥근 표시(도시 표시 둘레로 보인다). 엔진 p95(덧그림 포함, 헤드리스) 4단계 1.7~3.3ms, 1단계 1.3~2.7ms.
- Verified 영토 셈(단위 시험, Node): F9 크기 국가 16·도시 50 78ms, 고리 17개·점 273개.
- 사진: `planet-globe-territory-390-*`(1단계), `planet-layer-territory-390-*`(3단계), `planet-layer-territory-stage4-390-*`(4단계), 파스텔·다크.

