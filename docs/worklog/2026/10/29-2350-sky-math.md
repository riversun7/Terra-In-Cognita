# 1차맵 하늘 계산 `packages/engine/src/planet/sky.ts` — 항성·달·낮밤 세기·구름 걷힘·보임·하늘 시계 (WP2)

- 일시: 2026-10-29 23:50 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-primary-map-sky.md`(제안) 3·4·5·6·7·8절과 "구현하며 정한 것", 앞 기록 `29-2345-planet-calendar.md`(WP1), 작업 가지 `work/planet-sky`

## 한 일
- 새 순수 모듈 `sky.ts`(three를 쓰지 않는다, 화면 연출이라 `Math` 함수를 쓴다)와 시험 51개. 엔진·화면에는 아직 잇지 않았다(`@terra/engine/planet` 진입점에서 내보내지 않음. 그리기 변경 없음, `PlanetEngine` 변경 없음).
  - 타입: `PlanetSkyMode`(off·clock·fixed), `PlanetSkyFeatures`(낮밤·달·구름. 그림자 없음, U2), `PlanetSkyDescription`, `PlanetMoonDescription`, `SunState`, `MoonState`, `PlanetSkyState`. `[임시]` `PLACEHOLDER_PLANET_SKY`(자전축 23.44°, φ0 = 1/8, 달 하나: 삭망월 7시간·삭 = 기원·기울기 5°·승교점 0·12R·0.27R·시드 20261029).
  - 하늘: `skyAt(utcMs, sky)`(엔진 입구, 화면 쪽 달력 입구로 내림, 수가 아니면 null), `sunAt`, `moonAt`(방향·궤도 극·위상·밝은 비율), `moonPhaseMs`(`msSinceEpoch`의 정수 나머지), `localSolarHours`.
  - 화면 쪽: `nightStrength`(U1 (나): 가장 가까이 0.6, 거리 0.5R부터 1, 로그 거리 smoothstep, 기후 × 0.35, 0.5R가 가장 가까운 거리보다 가까운 작은 행성은 1), `cloudFade`(1.2R~2.5R 걷힘), `skyOnScreen`(네 모서리 시선), `moonOnScreen`(가드·옆 네 평면·행성 원판 뒤), `sunCosRangeOnScreen`(표본 5×5, 빗나간 시선은 가장자리 점), `skyClockIntervalMs`.
  - 상수 한곳: `DAY_NIGHT_BAND`(−0.14~0.06, 셰이더 출발값과 같다), `CLOSE_NIGHT_RULE`, `CLIMATE_NIGHT_FACTOR`, `CLOUD_FADE`, `SKY_CLOCK`.
- 구현하며 정한 것(설계와 다른 점, 이유)
  - 하늘 시계 규칙(U1 (나) 때문에 새로): 초안은 "가까운 거리는 밤 0이라 시계가 돌지 않는다"였다. 이제 가까운 거리에도 밤이 있어 규칙이 필요했다. 띠가 화면에 있으면 1.7초 ÷ 밤 세기(지구본 1.7초 = 초안의 0.5px 값, 가장 가까이 약 2.8초), 낮 쪽만이면 4초, 밤 쪽만이면 멈춤, 달은 0.5px 걸음, 0.25~4초. 근거: 한 화소의 밝기는 그 땅의 항성 고도로만 바뀌어 거리와 상관이 없다. 초안의 0.5px 규칙을 가까운 거리에 그대로 쓰면 띠 경계가 초당 약 95px 움직여(12km에서 1px ≈ 10m, 경계 927m/s, Assumed: 계산) 늘 0.25초(4Hz)가 된다. 3판 식으로 잰 한 걸음 밝기 변화: 1.7초 걸음에서 띠 가운데 약 0.5%, 항성이 지평선에 걸린 곳(√ 꺾임) 1.3%, 낮 쪽 4초 걸음 0.25% 이하(Assumed: 저장소 밖 계산 스크립트, 휴대폰 미확인). 통합 요청의 "쉬는 동안 1초에 한 번"과 다르다: 1초로 하려면 `SKY_CLOCK.bandStepMs` 하나를 바꾼다.
  - 낮 쪽만 보일 때 4초 걸음: 낮 쪽 밝기(0.94 × (1 − 0.18 × (1 − √sunCos)))도 항성 높이를 따라 천천히 바뀐다. 시계를 멈추면 오래 쉰 뒤(10분이면 수 %) 첫 손가락 동작에서 밝기가 튄다.
  - 달 보임에 "행성 원판 뒤에 다 가리면 그리지 않는다"를 더했다. 가린 달을 그리면 비용만 들고 하늘 시계가 달 걸음(0.33~0.5초)으로 돈다. 반쯤 걸친 달은 그린다(시험).
  - 하늘 타입을 `planetTypes.ts`가 아니라 `sky.ts`에 두었다. `work/second-map-sharpness`가 `planetTypes.ts`(`PlanetStats`)를 고치고 있어서다.
  - `moonPhaseMs`는 시각 대신 달력(`msSinceEpoch`)을 받는다. 같은 시각을 두 번 넘기다 어긋날 일이 없다.
- 시험(Verified: Vitest 5.0.5, `sky.test.ts` 51개 통과): 알려진 시각(기원 경도 180°·적위 −16.3366°, +15·30·45분, 계절 가운데 적위 0·±23.44°), 고도 식 = 내적(2,000곳), 항성 0.1°/s, 지역 정오, 하루·한 해·기원 경계 이어짐(1ms 걸음 2e-4° 아래), 1분 걸음 6°, 반구별 계절 부호(여름 내내 적위 > 0, 겨울 < 0), 하지 정오 40°N 73.44°·40°S 26.56°와 그때 남반구 겨울, 동지는 반대, 80°N 백야·80°S 극야, 기울기 0이면 계절 없음, 화면 쪽 소수 시각·NaN, 달 위상(삭·보름·1ms 전·삭 오프셋)·2300년 정확·삭 이각 ≤ 5°·보름 ≥ 175°·순행(상현 +90°, 하현 −90°)·밝은 비율 증가·기울기 0 삭에서 달 = 항성(좌표 일치)·적위 ≤ 28.44°·궤도 극 29바퀴·직교, 낮밤 세기(12km 0.6, 0.5R 1, 로그 가운데 0.8, 늘 증가, 기후 0.35, F4 1, NaN), 구름 걷힘(2.5R·1.2R·1.85R), 하늘 보임(세로 1.6R 없음·2R 있음, 가로 0.3R 없음·0.47R 있음), 달 보임(가장자리 밖·반쯤 걸침·원판 뒤·옆 17°의 세로·가로·카메라 뒤·가드), 가드(세로 6.94R·가로 3.36R·360×700 < 11.46R), 항성 고도 범위(가운데 1·가장자리 1/3, 뒤, 옆, 12km 좁음), 하늘 시계 간격.
- 틀린 코드를 잡는지 봤다(Verified): 11가지(항성 경도의 부호, 계절 위상의 부호, θ의 부호, 회전 행렬, 달이 도는 쪽, 0.5R → 0.6R, 원판 뒤 가림, 띠 조건, 가장자리 점, 지역 시각, 구름 문턱). 처음에 둘(달이 도는 쪽, 반쯤 걸친 달)이 살아남아 시험 두 개(순행, 반쯤 걸침)를 더했다. 이제 11가지 모두 실패한다.
- 점검(Verified): `oxlint --type-aware --deny-warnings`(바꾼 곳), `tsc`(shared·engine), Biome 포맷. `pnpm check` 전체는 아래.
- ADR "구현하며 정한 것" 절을 더했다(달력·하늘 계산·남은 것).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/planet/sky.ts`(새) | 하늘 순수 계산·타입·임시 값(WP2) |
| `packages/engine/src/planet/sky.test.ts`(새) | 위 시험 51개 |
| `docs/adr/2026-10-29-primary-map-sky.md` | "구현하며 정한 것 (공용 달력·하늘 계산)" 절 |

## 함께 바꿔야 하는 파일
- WP3 전에 `work/second-map-sharpness`를 합친다. WP3가 그 가지에서 받아야 하는 것(Verified: `git diff main...work/second-map-sharpness`, `deaa68e`)
  - `packages/engine/src/render/sharedRenderer.ts` `DEFAULT_MAX_PIXEL_RATIO = 2`(하늘 비용·기준선이 상한 2 기준).
  - `planetEngine.ts`(+5줄, 539줄 → 하늘 연결은 몇 줄만), `planetTypes.ts`(`PlanetStats.drawingBufferWidth/Height`, `maxPixelRatio` 주석) — `PlanetStats.sky`·`PlanetEngineOptions.sky`·`setSky`가 같은 파일을 고친다.
  - `apps/game/src/map/PlanetMapScreen.tsx`(HUD 픽셀 줄 `map_perf_pixels`, `?pixel-ratio=`, `data-pixel-ratio`·`data-buffer`)와 새 `apps/game/src/map/pixelRatioParam.ts` — 하늘의 HUD 줄(`planet_perf_sky`, 재기 모드에서만)·`data-sky*`·`planetSky.ts` 주소 읽기가 같은 곳에 들어간다.
  - `apps/game/messages/{ko,en}.json` 한 줄씩.
  - 그 가지는 `packages/shared/src/routes.ts` `map_planet.search`(`["planet-debug"]`)에 `pixel-ratio`를 넣지 않았다. WP3이 `planet-time`·`planet-sky`·`planet-sky-skip`·`planet-sky-bench`와 함께 넣는다(`routes.test.ts`).
  - ADR 36 "구현하며 정한 것 (렌더러)"의 픽셀 비율 줄은 그 가지가 고쳤다. 이 가지는 "결정 → 렌더러" 절에만 한 줄을 더했다(충돌 없음).
- WP3: `planetTypes.ts`·`index.ts`가 `sky.ts`의 타입을 다시 내보낸다. `skyController.ts`가 `skyAt`·`nightStrength`·`sunCosRangeOnScreen`·`skyClockIntervalMs`를 프레임마다 부르고, 셰이더 띠는 `DAY_NIGHT_BAND`를 uniform으로 받는다.
- WP4: `moonAt`의 `orbitPole`로 조석 고정 자세, `moonOnScreen`(바탕 구 반지름을 넘긴다), 달 화면 빠르기(px/s)를 `skyClockIntervalMs`에 넘긴다.
- WP5: `cloudFade`, 날씨 창 번호는 `calendar.msSinceEpoch`에서.

## 건드리지 말 것
- `planetEngine.ts`·`planetTypes.ts`·`planetMaterials.ts`·`PlanetMapScreen.tsx`(sharpness 가지가 고친다. WP3부터 그 위에서).
- `sky.ts`의 계산에 공용 달력 밖의 시각 계산을 따로 두지 않는다(같은 하늘·판정 계절과 같은 달력).

## 미검증·TODO·알려진 문제
- 휴대폰에서 본 것이 없다(Unknown): 하늘 시계 간격·밝기 걸음이 눈에 띄지 않는지, 가까운 거리 0.6이 일하기에 괜찮은지.
- `sunCosRangeOnScreen`은 표본 5×5 어림이라 띠가 표본 사이 화면 가장자리에만 걸치면 놓친다(그때는 낮 쪽 4초로 돈다, Assumed: 해가 작음).
- 셰이더·그리기·화면 연결은 없다(WP3~WP5).
- 기계 부하 아래 Vitest 제한 시간(30초)에 걸린 시험은 없었다.

## 사용자 결정 대기
- 없다.
