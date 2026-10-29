# 1차맵 하늘 낮밤 연결 — 항성 기준 셰이더, 하늘 조절기, 화면 시계·주소 매개변수, 재기 모드 (WP3)

- 일시: 2026-10-30 01:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-primary-map-sky.md`(제안) 2·4·7·8·9·10절과 "구현하며 정한 것 (낮밤·달·구름 연결)", 앞 기록 `29-2350-sky-math.md`(WP2), 작업 가지 `work/planet-sky`(main `dbe87c2` 위)

## 한 일
- 셰이더(`planetMaterials.ts`): 공용 하늘 uniform 8개(`uSkyBlend`·`uSunDir`·`uSunDirView`·`uNight`·`uNightTint`·`uTwilight`·`uShade`·`uNightLift`)를 타일·바탕 구가 같은 객체로 나눠 쓴다. GLSL 조각 `dayNightLight`·`nightFinish`(`DAY_NIGHT_GLSL`, 구름도 쓴다). 타일은 끔 길이 하늘 전 식 그대로이고, 켬 길은 항성 낮밤(매끈한 구 sunCos, 기복 = 카메라 빛 경사, 반짝임 = 항성) 뒤에 고른 칸을 얹는다. 켜지는 중에는 두 빛을 섞는다.
- 값 한곳(`skyShade.ts`): 3판 출발값과 셰이더와 같은 식의 JS판 `shadeColor`(밤 바닥 시험용).
- 하늘 조절기(`skyController.ts`): 모드(off·clock·fixed)·요소, 시계 읽기(소수 내림, null = 시계 전 → 지금 빛, 한 번 잰 뒤 null이면 이어 가기), 0.5초 켜기(fixed는 바로), 1분 넘는 늦은 차이는 방향을 0.5초에 옮기기, 거리·레이어 세기(U1 (나)), 오류 가두기(한 번 알림), 하늘 시계(띠 1.7초 ÷ 세기, 낮 쪽 4초, 밤 쪽 멈춤, 시계 전 250ms 살피기), 통계. 달·구름은 만들기 함수로 받는 자리만 두었다(WP4·WP5).
- 엔진(`planetEngine.ts` 몇 줄): `options.sky`, `setSky`, 그리기 바로 앞 `sky.update`, 통계 `sky`·`gpuBench`·`shaderPrograms`, 컨텍스트 복구 알림, 버리기. 틈 찾기는 늘 하늘 끔. 그리지 않는 엔진은 `inertPlanetEngine.ts`로 뺐다.
- 재기 모드(`gpuBench.ts`, `?planet-sky-bench=<1|2|4>`): 프레임마다 장면을 k번 그리고 기본 그리기 버퍼 1화소 읽기로 끝까지 기다린 시간(중앙값·최솟값, 최근 120프레임).
- 화면: `serverLink.clockMeasured()`, `planetSky.ts`(주소 매개변수·시계(5초 뒤 기기 시계)·동작 줄이기 → fixed·성능 보고 화면 이름), `planetViewParam.ts`(`?planet-view=`), `PlanetMapScreen.tsx`(하늘 모드 넘기기, 동작 줄이기 바뀜 → `setSky`, `data-sky*`·`data-sun`·`data-night`·`data-moons`·`data-cloud-*`·`data-gpu-ms`·`data-programs`, 재기 모드에서만 HUD 하늘 줄), 메시지 `planet_perf_sky`(ko·en).
- 주소 표(`routes.ts`): `map_planet.search`에 `pixel-ratio`·`planet-time`·`planet-sky`·`planet-sky-skip`·`planet-sky-bench`·`planet-view`.
- 시험(Verified: Vitest 5.0.5): 하늘 조절기 17개(off·fixed·요소 끔·기후·가까이 0.6, x.5ms = 내린 시각, 시계 전 → 250ms 살피기 → 0.5초 켜기, 출처, 30초 바로·10분 0.5초 옮기기, fixed → clock 켜진 채, 띠 1.7초·가까이 낮 4초·밤 멈춤, 숨김·fixed·off·닫은 뒤 예약 0, 오류 한 번 알림·setSky로 다시, 범위 밖 시각, 달 만들기·놓기·화면 빠르기·버리기), 낮밤 식 6개(밤 바닥 0.8, 0.6이 덜 잃음, 흰 땅 휘도, 세기 0, 박명, 기복 이득), 재질 3개(같은 uniform 객체·한 셰이더, 출발값, 끔 길 식), 화면 하늘 10개, 처음 볼 곳 3개, 시계 측정 1개, 주소 표(하늘 주소 만들기).
- 헤드리스 확인(Verified: Chromium 1243 + SwiftShader, 빌드한 앱·서버, 사설 DB·가짜 계정, 저장소 밖 하네스): 끔 모드 = main 빌드 화소 같음(최대 차이 0, 두 장), 고정 시각 사진(지구본 낮·경계·밤, 북반구 여름 극, 300km 박명, 12km 밤 0.6, 기후 0.35, 다크 테마 둘), 시계 길 `server`·간격 1,700ms·콘솔 오류 0, 동작 줄이기 → fixed, 틈 찾기 → off, 재기 모드 k=2 GPU 457ms(켬)·408ms(끔, SwiftShader 값).
- 검토: break-ui(HUD 하늘 줄, 390·320px, ko·en, 큰 수·빈 값) → 영어에서 단위·구분점이 줄 앞뒤로 갈라져 줄바꿈 없는 공백으로 묶었다. 빈 값은 "–°"·"–ms"로 둔다(다른 HUD 줄과 같은 "–" 관례). web-design-guidelines: 새 화면 요소는 글자 한 줄뿐이다. 숫자는 다른 HUD 줄처럼 `toFixed`(ko·en만이라 `Intl` 차이 없음). 저절로 바뀌는 하늘의 멈춤 수단(WCAG 2.2.2)은 동작 줄이기만 따르고 설정 스위치는 출시 전 할 일(ADR 7절, PLAN 14장).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/planet/planetMaterials.ts` | 공용 하늘 uniform·낮밤 GLSL 조각·타일과 바탕 구의 끔/켬 길 |
| `packages/engine/src/planet/skyShade.ts`(새)·`skyShade.test.ts`(새) | 3판 값 한곳·셰이더와 같은 식의 JS판·밤 바닥 시험 |
| `packages/engine/src/planet/skyController.ts`(새)·`skyController.test.ts`(새) | 하늘 조절기와 시험 |
| `packages/engine/src/planet/gpuBench.ts`(새) | 재기 모드 |
| `packages/engine/src/planet/planetView.ts` | `setSkyLight`(보기 공간 항성 방향) |
| `packages/engine/src/planet/planetEngine.ts` | 하늘 옵션·`setSky`·프레임 연결·통계·재기 모드 그리기 |
| `packages/engine/src/planet/inertPlanetEngine.ts`(새) | 그리지 않는 엔진을 빼서 600줄 경고 아래로 |
| `packages/engine/src/planet/planetTypes.ts`·`index.ts` | 하늘 타입 다시 내보내기, 옵션·통계·`setSky`·`PlanetDescription.sky` |
| `packages/engine/src/planet/sky.ts` | clock 모드 `source?`(시계 출처) |
| `packages/engine/src/planet/vec3.ts` | `slerpUnit`(늦게 맞출 때 방향 옮기기) |
| `packages/engine/src/planet/planetMaterials.test.ts`(새) | uniform 나눠 쓰기·끔 길 식 |
| `apps/game/src/net/serverLink.ts`·`serverLink.test.ts` | `clockMeasured()` |
| `apps/game/src/map/planetSky.ts`(새)·`planetSky.test.ts`(새) | 하늘 모드 고르기 |
| `apps/game/src/map/planetViewParam.ts`(새)·`planetViewParam.test.ts`(새) | `?planet-view=` |
| `apps/game/src/map/PlanetMapScreen.tsx` | 하늘 넘기기·동작 줄이기·`data-*`·HUD 하늘 줄·보고 이름 |
| `apps/game/messages/ko.json`·`en.json` | `planet_perf_sky` |
| `packages/shared/src/routes.ts`·`routes.test.ts` | `map_planet.search` |
| `docs/adr/2026-10-29-primary-map-sky.md` | "구현하며 정한 것 (낮밤·달·구름 연결)" 낮밤 절 |

## 함께 바꿔야 하는 파일
- 셰이더 낮밤 식(`planetMaterials.ts` `DAY_NIGHT_GLSL`·`skyLight`)을 바꾸면 `skyShade.ts` `shadeColor`도 같이 바꾼다(밤 바닥 시험이 JS판을 본다).
- 화면 주소 매개변수를 더하면 `packages/shared/src/routes.ts` `map_planet.search`와 `routes.test.ts`도(표에 없는 검색어는 주소를 다시 만들 때 빠진다). 2차맵(`map`)의 `?pixel-ratio=`는 아직 표에 없다(이 작업 밖, sharpness 가지의 주소).
- WP4·WP5: `skyController.ts`의 `createMoons`·`createClouds`를 엔진이 넘긴다.

## 건드리지 말 것
- 타일 조각 셰이더의 끔 길(`cameraLight(applyPick(base))`): 끔 모드 = 지금 모습 시험(화소 비교)의 기준이다.
- 편집기는 하늘을 넘기지 않는다(옵션 없음 = off).

## 미검증·TODO·알려진 문제
- 휴대폰에서 본 것이 없다(Unknown): 밤 밝기·박명 띠(헤드리스에서 박명의 따뜻한 빛은 옅다)·가까운 거리 0.6, 하늘 시계 간격, 재기 모드 값. WP7(NAS 배포 뒤 휴대폰 측정)에서 본다.
- 1차맵 조각이 이미 +17.8kB(gzip +6.4kB)다. ADR 10절 상한(+25kB, gzip +10kB)을 달·구름까지 지키는지는 WP5 뒤에 잰다.
- 하네스는 저장소 밖 일회용이다(`e2e/`가 생기면 옮긴다, ADR 다시 볼 조건).

## 사용자 결정 대기
- 없다.
