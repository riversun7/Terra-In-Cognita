# NPC 도시 간격·배후지·여섯 원자재 얻는 길

- 일시: 2026-11-11 22:50 ~ 2026-11-12 (KST)
- 작업 도구: Claude Code
- 관련: 가지 `work/city-spacing`(통합 머리 `39c40ca57e`에서), ADR `2026-11-11-city-catchment.md`(새, 제안), `2026-11-07-world-layout.md`·`2026-11-11-production-six.md`·`2026-11-07-gather-objects.md` "바뀜 (2026-11-11 …)", 질문 `docs/questions/2026-11-11-city-spacing.md`(1016~1027)

## 사용자 지적(2026-11-11, 원문)
"개선4. npc세력의 도시 배치를 어느정도 벌려야 한다. 너무 가까우면 도시를 유지하기 위한 주변 지형자원의 점유 영역이 겹쳐 도시간의 자원경쟁으로 서로 발전하지 못한다. 현재 너무 가깝게 바둑판배열로 다닥다닥 붙어있다. 난이도 높은 밸런스 작업이며, 현재 자원채집 시스템이 미흡하여 이부분부터 개선해야한다. 어려운 부분은 질문해도 좋고. 6가지 원자재의 획득방식 구현이 중요하다."

## 한 일
1. 진단(Verified: 코드 읽기 + 측정 스크립트 `apps/server/bench/citySpacing.ts`).
2. 여섯 원자재의 땅 자리: 밭·목초지·물터(팩 core@66 오브젝트 source `plot`) → 여섯 채집 시설이 모두 반경 안 땅 자리 번수를 쓰는 채집소.
3. 배후지 간격 배치: 시작 도시를 고정 걸음 표 대신 간격을 지키며 배후지 덮임이 높은 칸부터. 설정 칸 다섯. `/dev/world-layout` 배후지 덮개.
4. NAS 세계는 건드리지 않았다. 새 배치는 세계 새로 시작 뒤에 든다(사용자 결정 — 질문 1026).

### 1단계 진단
- 지금 자리 고르기: 국가 수도는 가장 먼 점 고르기(국력 등급 간격 — 국가끼리는 멀다). 시작 도시는 수도 2차맵 + **고정 걸음 표**(`ringOffsets(4)` × 등급 `cityStepCells` 1~2)로 처음 맞는 칸 → 16개 국가 모두 (0,−s)(−s,0)(s,0)(0,s)(−s,−s)… = 바둑판. 땅 자원을 보지 않고, 같은 국가 도시끼리 간격 규칙이 없다(`foundingConflict`는 다른 세력 영향권만).
- NPC 기본 시설(`facilities/npcSeed.ts`): 도시 2차맵 하나 안, 가운데에서 48 배치 칸 안. 채집 시설 종류는 그 도시 칸 하나의 행성 값.
- 채집소(`gather/station.ts`)가 쓰는 자원: 그 2차맵 오브젝트 가운데 반경 40 + (레벨 − 1) × 4 배치 칸 안. 도시가 2차맵 하나에 하나라 2차맵 채집 반경끼리는 지금도 겹치지 않는다(가운데 128칸에서 48 + 40 = 88칸 < 128).
- 농장·목장·낚시터는 오브젝트 없이 시설 안에서 땅과 상관없이 끝없이 냈다. NPC 도시 경제(시뮬 `runEconomy`)는 땅·오브젝트를 전혀 보지 않는다.

### 측정: 옛 배치 → 새 배치 (S2 시험 행성 F9, 팩 국가 프리셋 16개·국력 등급, 빈 세계 등급 배치 = `/dev/world-layout` [제안]·세계 새로 시작 뒤 부팅과 같은 자리 함수, 피할 2차맵 = 시험 2차맵 6장, 배후지 R = 2칸)
| 지표 | 옛 | 새 |
|---|---|---|
| 도시 수(못 세운 수) | 49 (0) | 49 (0) |
| 같은 국가 가장 가까운 도시 | 최소 0.80칸(1.19km) · 중앙 1.64칸(2.46km) · 최대 2.17칸(3.26km) | 최소 4.06칸(6.10km) · 중앙 5.55칸(8.33km) · 최대 7.86칸(11.80km) |
| 다른 국가 가장 가까운 도시 | 최소 23.17칸(34.77km) · 중앙 30.03칸 | 최소 15.18칸(22.78km) · 중앙 29.08칸 |
| 붙은 도시 쌍(≤ 1.5칸) | 18 | 0 |
| 2차맵 나눠 쓰는 도시 | 0 | 0 |
| 배후지 겹친 쌍(< 2R) 같은 국가·다른 국가 | 57 · 0 | 0 · 0 |
| 둘 이상 배후지에 든 칸 | 147 | 0 |
| 배후지 칸 평균 혼자 → 가장 가까운 도시가 나눈 뒤 | 11 → 7 | 11 → 11 |
| 수도에서 걸음(초강대국 하나) | (0,−2)(−2,0)(2,0)(0,2)(−2,−2) | (0,5)(6,0)(−3,−5)(−5,2)(4,−6) |
| 계획 시간 | 128~228ms | 약 300ms |
- R = 3칸으로 잰 옛 배치: 같은 국가 겹친 쌍 67, 겹친 칸 400.
- 1차맵 칸 = 2차맵 하나 = 평균 1.5007km.
- 원자재(1차맵 칸 비트, 문턱 = NPC 씨앗 설정 칸): 49곳 모두 배후지에 광석 칸 0(고도 500m 넘는 칸 없음). NPC 씨앗 채집 시설 농장 49 · 벌목장 49 · **광산 0**/49. 도시 2차맵 여섯 곳을 생성해 보니 활엽수 458~945·약초 덤불 65~498·야자수·쓰러진 나무만, **바위·광맥 0**, 물 지표 0~1칸(질문 1020).
- 덮임 평균은 옛·새 모두 750‰(시험 행성 도시 둘레 땅이 거의 같다 — 숲 5% 문턱이 낮다, 질문 1027). 자원 차이를 고르는지는 가짜 행성 시험(`citySites.test.ts` 언덕 쪽 고르기)으로 확인했다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/catchment.ts`(새)·`catchment.test.ts`, `package.json` | 칸 원자재 비트·배후지 덮임·도시 간격·자리 점수(서버 배치·화면 같은 함수) |
| `apps/server/src/world/citySites.ts`(새)·`citySites.test.ts` | 배후지 칸·나누기·덮임 붙잡기·지방 도시 자리(`pickCitySites`). `walkCell`을 여기로(worldLayout.ts가 다시 내보냄) |
| `apps/server/src/world/worldLayout.ts` | 머리 주석 4: R > 0이면 배후지 배치, 수도 점수에 덮임. `LayoutLand.forest`, `LayoutTier.needs`, `catchmentRulesOf` |
| `apps/server/src/world/catchmentView.ts`(새), `placementService.ts`, `trpc/worldLayout.ts`(+시험 가짜) | tRPC `worldLayout.catchment` 배후지 덮개 |
| `packages/shared/src/worldPlacementApi.ts` | `WorldCatchmentView`·`WorldCatchmentCity` |
| `packages/sim/src/society/worldSeed.ts`·`tuningWorldSeed.ts`, `content/core/tuning.json` | 설정 칸 `city_catchment_*` 다섯([임시]) |
| `packages/content/src/schema/gatherObjects.ts`·`index.ts` | 오브젝트 자리 종류 `plot`(지표·문턱·원자재), 칸 `direct` |
| `content/core/gather_objects.json`·`manifest.json` | 밭·목초지·물터, core@66 |
| `apps/server/src/gather/kinds.ts`·`objects.ts`·`service.ts`·`world.ts`·`reads.ts`·`station.ts`(주석) + 시험(`kinds.test.ts` 새, `objects.test.ts`, 종류 글자 넷) | plot 자리 놓기, 직접 캐기 막기(`unavailable`), 기후 비트, 조회 `direct` |
| `packages/shared/src/gather.ts` | 종류 보기 `direct?`(선택 칸) |
| `apps/server/src/facilities/npcSeed.ts` | `landGather`를 같은 원자재 함수로(결과 같음) |
| `apps/game/src/map/gather/GatherPanel.tsx`·`gatherOverlay.ts`·`gather.css`·`stationData.ts`·`gatherState.test.ts` | 땅 자리는 [채집] 숨김·안내 줄, 표시 색(밭·목초지·물터), [직접 캐기] 대상에서 뺌 |
| `apps/game/src/editor/worldLayout/WorldCatchmentPanel.tsx`(새)·`WorldLayoutScreen.tsx`·`worldLayoutModel.ts`(+시험)·`worldLayout.css` | 배후지 덮개 판 |
| `apps/game/src/economy/FacilityCards.tsx` | 카드에 `data-facility`(화면 시험이 시설로 카드를 고른다) |
| `apps/game/messages/{ko,en}.json` | 문구 열일곱(ko·en) |
| `apps/server/src/world/worldLayout.test.ts`·`worldLayoutTiers.test.ts` | 옛 배치 시험은 R = 0으로 |
| `apps/server/src/world/worldLayout.db.test.ts`·`nationPlacement.db.test.ts`·`nationTiers.db.test.ts` | 시작 도시 간격 기대를 배후지 간격(4칸 이상·12칸 안)으로 |
| `apps/server/bench/citySpacing.ts`(새), `tsconfig.json`·`bench/tsconfig.json` | 측정 스크립트(서버 모듈을 가져와 상위 tsconfig로 검사) |
| `e2e/world-layout.spec.ts`·`e2e/gather-station.spec.ts` | 배후지 덮개 시험, 농장 = 밭 채집소 |
| ADR·질문·PLAN 14장 | 위 관련 |

## 함께 바꿔야 하는 파일
- 원자재 문턱을 바꾸면 `@terra/shared/catchment` 한 곳(배치·밭 기후·NPC 씨앗·덮개가 함께 바뀐다).
- 지형 지표 번호(`@terra/protocol` `TERRAIN_SURFACE`)를 바꾸면 팩 `GATHER_PLOT_SURFACES` 차례도(시험 `kinds.test.ts`).

## 건드리지 말 것
- NAS 세계(새 배치는 세계 새로 시작 뒤에만 — 사용자가 정한다, 질문 1026).

## 검사(Verified: 실행)
- 단위: 서버 배치·배후지·채집 시험(`citySites` 9, `worldLayout`·`worldLayoutTiers`, `gather/*` 20+3, `npcSeed` 5), shared `catchment` 5, sim 설정 칸 시험 37, 게임 `map/gather` 6·`editor/worldLayout` 7 — 통과.
- DB: `worldLayout.db`·`nationPlacement.db`·`nationTiers.db`·`gather`·`station.db`·`npcSeed.db`·tRPC `worldLayout` 42개 통과(고친 뒤).
- 화면: `e2e/world-layout.spec.ts` 9개 통과(새 배후지 덮개 2개 포함, 1440 네온·390 라이트 사진). `e2e/gather-station.spec.ts`는 아래 "끝 검사"에 적는다.
- 끝 검사(`pnpm check`·빌드·`check-pwa`·`check:bundle`): 아래에 적는다.

## 미검증·TODO·알려진 문제
- NPC 도시 경제는 아직 땅 자리를 쓰지 않는다(질문 1024 — 다음 줄기 추천). 시뮬 출력·`SIM_VERSION` 그대로.
- 시작 도시가 있는 낮은 땅에는 광석이 없다(질문 1020).
- 이미 선 NPC 농장이 반경 안 밭을 갖는지는 시작 도시 2차맵 여섯 곳의 지표(풀·흙 99%)로 추정(Assumed).
- 원자재 문턱 설정 칸을 바꾸면 밭·목초지 자리는 다음 시작 때 바뀐다(오브젝트 목록은 지형 판 표지마다 한 번).

## 사용자 결정 대기
- 질문 1016~1027(`docs/questions/2026-11-11-city-spacing.md`). 특히 1026: 새 배치를 NAS에 들이려면 세계 새로 시작(`world-reset`)이 필요하다.
