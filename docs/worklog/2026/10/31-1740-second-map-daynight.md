# 2차맵 낮밤 조명(1차맵과 같은 시각·자리)

- 일시: 2026-10-31 17:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-28-s1-second-map.md`(33, 제안) "구현하며 정한 것 (2차맵 낮밤)", ADR `2026-10-29-primary-map-sky.md`(제안) "그 뒤: 2차맵 낮밤", 기획 D-329(하늘 질문 22), 사용자 의견(2026-10-31) "조명은 더 테스트 필요 밤 낮 등. 항상 낮인거같다?". 가지 `work/second-map-daynight`(main `16f1587`에서)

## 한 일
- 2차맵 빛이 1차맵의 그 자리와 같은 시각을 따른다. 고정 반구광 + 방향광(`secondMapEngine.ts`)을 시각마다 바꾸는 빛으로 바꿨다.
  - 시각·항성·달은 1차맵 하늘 함수(`planet/sky.ts` `skyAt`)를 그대로 쓴다. 시계도 1차맵 것(`createSkyClock`)이다.
  - 자리는 2차맵 키 → `@terra/planet/projection`의 칸 가운데·꼭짓점 → 위도·경도와 2차맵 세계 축(면 격자 축)이다.
- 빛 모델(`packages/engine/src/lighting/secondMapLight.ts`, 순수 함수)
  - 낮 기준은 지금 고정 빛이다. 해가 낮을 때 채움(0.6), 땅에서 튀는 빛(0.4), 노을·아침저녁 색, 박명은 1차맵과 같은 띠·색이다.
  - 밤은 1차맵 지구본의 온전한 밤(라벤더)이다. 달은 푸른 방향광이고, 항성 직사광이 0이 된 뒤에만 방향광을 넘겨받는다.
  - 2차맵 밖 하늘 색도 같이 바뀐다.
- 밤 읽기: 밤 바닥 상수 `SECOND_MAP_NIGHT_FLOOR`(0.5), 유닛 몸 밤 빛 `UNIT_NIGHT_LIFT`(0.3, 유닛 몸 셰이더 한 줄). 외곽선·아이콘·고른 표시는 원래 빛을 받지 않는다.
- 하늘 시계(`lighting/secondMapSky.ts`): 1초마다 계산하고 눈에 띄게 바뀔 때만 다시 그린다. 시계를 재면, 또는 모드가 바뀌면 0.5초에 걸쳐 옮긴다. 숨긴 탭에서는 쉰다.
- 화면: `?second-map-time=<0~24>`(지역 시각에 멈춤, 달력 3일째 = 달이 거의 보름), `?second-map-sky=off`, 동작 줄이기면 연 시각에 멈춤(바뀌면 `setSky`). HUD 줄 "지역 시각 · 해 고도 · 달 %"(메시지 키 `map_perf_light`, ko·en), 표지 `data-light-*`.
- 주소 표 `map.search`에 `pixel-ratio`·`second-map-time`·`second-map-sky`를 넣었다. 그 전에는 `pixel-ratio`가 2차맵 줄에 없었다(주소를 다시 만들 때 빠진다).
- 동작 줄이기 판별(`reducedMotionList`)을 1차맵 화면에서 `planetSky.ts`로 옮겨 두 화면이 같이 쓴다.
- 화면 시험 도우미 `hideSummary`를 `e2e/inbox.spec.ts`에서 `e2e/helpers/trpc.ts`로 옮겼다. 2차맵 낮밤 사진 시험에서 시험 일꾼이 있는 dev 계정에 복귀 요약 대화상자가 떠 [전체 보기] 단추를 가렸다.

## 확인 (Verified, 이 작업 트리, Node 24.22.1, 개발 컨테이너 Xeon 2.1GHz 4 vCPU 공유)
| 확인 | 결과 |
|---|---|
| 단위 시험(새 것) | `secondMapLight.test.ts` 20개·`secondMapSky.test.ts` 5개·`unitMaterials.test.ts` 2개·게임 `secondMapSky.test.ts` 5개 통과 |
| 일부러 틀린 코드 | 낮 채움 0, 밤 깊이 1.3, 세계 x축 뒤집기, 유닛 밤 빛 0, 땅 튀는 빛 0에서 시험이 실패했다. 직사광 문턱 −0.05는 달 켜짐이 같은 문턱을 써서 여전히 이어져 살아남았다(틀린 코드가 아니다) |
| `TEST_DATABASE_URL=… pnpm check` | 통과: 시험 파일 215개·시험 2,083개, 다국어 852개 키. 그 전 실행에서 `apps/server/src/metrics.test.ts`(이벤트 루프 지연, 부하 평균 5.6)가 한 번 실패했고 따로 두 번 돌리니 통과했다(시간 시험, 이 변경과 무관) |
| `pnpm e2e`(전체) | 85개 통과(6.9분). 새 시험: 낮밤 표지·화면 밝기·끔·서버 시계 1개, 사진 4개(390·1440 × 파스텔·다크, 각 낮·박명·밤) |
| `pnpm check:bundle` | 첫 화면 JS 127,754 → 127,777B(+23B, 주소 표) / 상한 131,416B |

- 빛 수치(S1 시험 2차맵 = 적도·경도 0 근처, 달력 3일째. 평지 흰 면 밝기 ÷ 낮 기준, R·G·B)
  - 12시(해 89.9°) 1.042, 9시(45°) 0.971, 7시(15°) 0.861·0.848·0.833, 17:36(6°) 0.823·0.772·0.715
  - 18:09(해 −2.2°, 낮 정도 0.51) 0.669·0.626·0.663, 18:24(−6°) 0.558·0.573·0.724
  - 23시(달 52°, 96%) 0.588·0.626·0.821, 달 없는 밤 0.536·0.566·0.745(휘도 0.29, L* 60.8)
- 대비(WCAG, 평지 빛으로 칠함): 유닛 색 5개 × 지표 4개에서 밤 대비 ÷ 낮 대비의 최솟값은 밤 빛 0.3이면 1.65(가장 낮은 밤 대비 1.86), 밤 빛이 없으면 0.88(1.02). 남색 외곽선 대 땅은 낮 5.5~7.4, 밤 2.3~2.8이다.
- 화면 밝기(사진의 지도 부분 평균 휘도, sRGB 0~1. 헤드리스 SwiftShader): 390 낮 0.726·박명 0.453·밤 0.445, 1440 낮 0.761·박명 0.469·밤 0.462. 밤 ÷ 낮 약 0.61. 테마는 HUD만 바꾼다(세계 색은 같다, D-070).
- 묶음: 2차맵 조각 59.11 → 67.85kB(gzip 22.62 → 25.78kB), 1차맵 조각 19.96 → 18.36kB(하늘 계산이 함께 쓰는 조각으로 옮겨 갔다, Assumed: 소스 맵을 다 보지 않음), 미리 캐시 1,368.31 → 1,378.18KiB(+9.87KiB).
- 사진(세션 임시 폴더): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/second-map-daynight/shots/` 아래 `second-map-daynight-{390,1440}-{pastel,dark}-{day,dusk,night}.png` 12장

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/lighting/secondMapLight.ts`(새)·`.test.ts` | 자리(칸 키 → 위도·경도·세계 축), 시험 시각, 빛 모델, 밤 바닥, 유닛 밤 빛 값, 빛 비교·섞기 |
| `packages/engine/src/lighting/secondMapSky.ts`(새)·`.test.ts` | 하늘 모드 → 지금 빛, 1초 걸음, 0.5초 옮기기 |
| `packages/engine/src/secondMapEngine.ts` | 고정 빛 → 하늘 빛(빛 적용, 1초 타이머, 숨김 쉼, `setSky`, 통계 `light`) |
| `packages/engine/src/engineTypes.ts`·`index.ts` | `mapKey`·`sky` 옵션, `EngineLightStats`, `setSky`, 내보내기 |
| `packages/engine/src/units/unitMaterials.ts`·`unitView.ts`·`unitMaterials.test.ts`(새) | 유닛 몸 밤 빛(Lambert 셰이더 한 줄, 캐시 키 따로) |
| `apps/game/src/map/secondMapSky.ts`(새)·`.test.ts` | 주소 매개변수 → 하늘 모드, HUD 지역 시각 |
| `apps/game/src/map/SecondaryMapScreen.tsx` | 하늘 모드·자리 넘기기, 동작 줄이기, HUD 줄, `data-light-*` |
| `apps/game/src/map/planetSky.ts`·`PlanetMapScreen.tsx` | 동작 줄이기 판별을 함께 쓰려고 옮김 |
| `apps/game/messages/{ko,en}.json` | `map_perf_light` |
| `packages/shared/src/routes.ts`·`routes.test.ts` | `map.search`에 시험 주소 셋 |
| `e2e/vision.spec.ts`·`e2e/helpers/trpc.ts`·`e2e/inbox.spec.ts` | 낮밤 시험·사진, `hideSummary` 공용으로 |
| `docs/adr/2026-10-28-s1-second-map.md` | "구현하며 정한 것 (2차맵 낮밤)" |
| `docs/adr/2026-10-29-primary-map-sky.md` | "그 뒤: 2차맵 낮밤" |
| `docs/PLAN.md` | 5.7 2차맵 낮밤 줄 |

## 함께 바꿔야 하는 파일
- 1차맵 낮밤 값(`skyShade.ts` `DAY_NIGHT_SHADE`, `sky.ts` `DAY_NIGHT_BAND`)을 바꾸면 2차맵 박명·밤 색도 바뀐다. `secondMapLight.test.ts`의 밤 바닥·대비 시험을 함께 본다.
- 2차맵을 행성 값에서 만들 때(ADR `2026-10-31-second-map-from-planet.md`) 지형 행·열을 면 격자 축(x = i, z = −j)에 맞춘다. 다르게 놓으면 `secondMapPlace`의 축을 같이 바꾼다.

## 건드리지 말 것
- 하늘 끔(`?second-map-sky=off`)과 시계를 재기 전은 지금 고정 빛과 같은 값이다(`FIXED_SECOND_MAP_LIGHT`, 시험이 지킨다). 끔 모드 화면을 바꾸지 않는다.

## 미검증·TODO·알려진 문제
- 휴대폰에서 보지 않았다(Unknown). 밤 깊이·달빛·노을 색은 헤드리스 사진으로 고른 출발값이다.
- 1440 한낮처럼 멀리서 보면 유닛(높이 5px 안팎)은 외곽선이 대부분이라 어둡게 보인다. 땅 튀는 빛으로 옆면은 고정 빛의 그늘 쪽만큼 밝혔다.
- 달 시차(보이는 거리 12R)는 무시했다. 2차맵에서 달 고도가 최대 약 5° 다를 수 있다.
- 1차맵에서 2차맵으로 밤에 들어가면 밤 세기가 0.6 → 1로 바뀐다(아래 결정).

## 사용자 결정 대기
- 2차맵 밤 깊이: (가) 지금처럼 1차맵 지구본 밤과 같게(밤이 뚜렷하다, 평지 흰 면 약 0.54~0.75배. 1차맵 가까운 거리 0.6에서 들어오면 조금 어두워진다) (나) 1차맵 가까운 거리와 같게 0.6(밤이 옅다, 약 0.72~0.85배. 들어갈 때 바뀌지 않는다). 추천 (가), 사용자 의견이 "항상 낮인 것 같다"였기 때문이다. 값 하나라 휴대폰을 본 뒤 바꾸기 쉽다.
