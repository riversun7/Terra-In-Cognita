# 2차맵 소품 더 풍성하게(장식 11종·나무 변형·땅 잔소품)와 유닛 앞 나무 옅게

- 일시: 2026-11-11 23:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-10-31-second-map-from-planet.md` "바뀜 (2026-11-11, 소품 더 풍성하게)", 질문 `docs/questions/2026-11-11-map-zoom-close.md` 996(답 다, D-523 포인터), 가지 `work/map-props-rich`

## 한 일
- 사용자 요구 "개선5. 2차맵에 따른 오브젝트를 더 풍성하게 해야한다." — 2차맵이 그 땅답게 보이도록 소품 종류를 늘렸다.
- 팩 `map_props`에 엄폐 0 장식 소품 11종(core@66): 선인장·마른 덤불·키 큰 풀·꽃밭·돌무더기·떠밀려 온 나무·흰개미 둔덕·마른 나무·고사리·얼음덩이·짐승 뼈. 바이옴 비중 + 기온·습도·경사·물까지 거리 곡선. 흩기 우선순위 맨 뒤라 판정 소품·엄폐 층은 그대로.
- 생성기: 출력이 같은 최적화(비중 없는 흩기 규칙 건너뛰기, 비중 0 지형 칸 건너뛰기). 생성기 판 그대로.
- 엔진: 소품을 부품(기하) 6가지 InstancedMesh로 그린다(그리기 호출 8 → 6 이하). 새 그림 11종 모델, 나무 변형(활엽 셋·침엽 셋·야자 기울기), 눈 지표에 눈 얹기, 땅 잔소품(지표별 풀포기·꽃·자갈·조개·눈덩이·얼음 조각·사초·부들, 숲 아래 고사리·버섯).
- 유닛 앞 옅게(질문 996 다): 고른(없으면 따라가는) 유닛과 카메라 사이 소품을 화면 점 무늬로 반쯤 덜 그린다. 지도 HUD `data-props-faded`.
- 개발자 2차맵 시험 화면: 새 그림 이름(ko·en), 측정 표지 `data-clutter`·`data-draw-calls`·`data-triangles`·`data-render-p95`·`data-view-span`.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/mapProps.ts`(+시험) | 그림 이름표 끝에 11종 |
| `content/core/map_props.json`, `manifest.json` | 장식 소품 11종, core@66 |
| `packages/content/src/schema/mapProps.ts`, `validate/mapProps.test.ts` | 주석(장식 소품도 팩에), 모르는 그림 예를 바꿈 |
| `packages/planet/src/secondMap/placement.ts` | 흩기 규칙 건너뛰기(출력 같음) |
| `packages/planet/src/secondMap/testMapProps.ts`, `props.test.ts`, `generate.test.ts`, `placement.test.ts` | 팩 사본, 골든 해시, 장식 소품이 엄폐·판정 칸을 바꾸지 않는 시험 |
| `packages/engine/src/props/propParts.ts`(새), `propFade.ts`(새), `propView.ts`, `propLook.ts`(+시험) | 부품 그리기·새 모양·잔소품·옅게 |
| `packages/engine/src/terrain/neighbourTerrains.ts`, `secondMapEngine.ts`, `engineTypes.ts`, `engineParts.ts` | 지표를 소품 층에, 옅게 갱신, 요약 `propClutter`·`propsFaded` |
| `apps/game/src/map/mapHudData.ts` | `data-props-faded` |
| `apps/game/src/editor/secondMapLab/SecondMapLabScreen.tsx`, `labMessages.ts`, `messages/{ko,en}.json` | 측정 표지, 새 그림 이름 |
| `e2e/map-props.spec.ts`(새) | 6/6 옅게·소품 측정·사진 |
| `docs/adr/…second-map-from-planet.md`, `docs/questions/2026-11-11-map-zoom-close.md` | 바뀜, 996 답 |

## 함께 바꿔야 하는 파일
- 팩 `map_props`를 바꾸면 `packages/planet/src/secondMap/testMapProps.ts`(이름·설명 뺀 사본)와 `generate.test.ts` 골든 해시.
- 새 그림을 더하면 `MAP_PROP_ARTS` 끝 + 엔진 `propLook.ts` 표 + `propParts.ts` 모양 + 2차맵 시험 문구(ko·en).
- 장식 소품은 팩 끝에 둔다(앞에 두면 판정 소품 자리를 빼앗아 엄폐·원자재 오브젝트가 바뀐다 — 생성기 시험이 잡는다).

## 건드리지 말 것
- 원자재 오브젝트 그림 표(`gather_objects.json` arts)·sim `isTreeArt`: 장식 그림을 넣지 않았다(city-spacing 줄기 범위).

## 시험·측정 (Verified: 실행)
- 단위 시험: planet secondMap·shared mapProps 55개 통과, engine props 17개 통과(부품 삼각형·변형·눈 얹기·잔소품·옅게 세기), content mapProps 7개 통과, 서버 소품·지형·원자재 오브젝트·sim 지형 시험 묶음 통과(195개, 내용 시험 하나 고친 뒤).
- `pnpm check:content origin/main` 통과(core@66). `pnpm check`(TEST_DATABASE_URL 포함) 통과 — 617파일 4,771개. `pnpm check:docs origin/main` 통과.
- 소품 종류 전·후(F9 S2 시험 행성, 같은 행성 값, 저장소 밖 측정 스크립트): 시험 자리·바이옴 16곳 가운데 15곳에서 그림 종류가 늘었다. 강 5 → 14, 초지 4 → 9, 산 5 → 10, 사바나 3 → 11, 사막 1 → 6, 툰드라 3 → 8, 온대림 4 → 8, 빙상 1 → 3, 바닷가 5 → 9, 숲 4 → 6, 호수(물뿐) 0 → 0. 차폐·은폐 몫은 16곳 모두 전후 같다.
  - 예: 사막 = 선인장 2,256·마른 덤불 4,431·돌무더기 1,439·마른 나무 210·뼈 65칸(전에는 덤불 52칸뿐), 고산 = 돌무더기 6,008·얼음덩이 211, 초지 = 키 큰 풀 10,967·꽃밭 2,977·마른 덤불 1,459.
- 생성 시간(F7 시험 행성 땅 2차맵 80장, 번갈아 잼): p50 21~23ms → 31ms, p95 29~47 → 49ms. 장식 규칙 덩이 노이즈가 큰 몫이라 덩이는 다섯 규칙에만 둔다.
- 화면 시험 `e2e/map-props.spec.ts` 4개 통과(헤드리스 Chromium SwiftShader — 휴대폰 값 아님):
  - 지도 6/6 진입(player 시작 자리 나무 덤불): 소품 150~157, 옅게 4(파스텔·다크). 사진에서 사이보그 앞 나무 갓에 점 무늬 구멍이 나고 사이보그·고리가 보인다.
  - 2차맵 시험 숲: 멀리(짧은 변 360m) 소품 2,978·잔소품 283·그리기 호출 6(장면 전체)·삼각형 152,699 / 가까이(49m) 708·112·5·62,179.
  - 2차맵 시험 초지: 멀리 1,344·264·8·74,769 / 가까이(60m) 363·146·7·45,977.
- `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 108,785B / 상한 131,416B.
- 사진(저장소 밖): `map-props-fade-390-pastel.png`·`-dark.png`, `map-props-lab-forest-390-neon.png`, `map-props-lab-grassland-390-light.png`.

## 미검증·TODO·알려진 문제
- 휴대폰 실기기에서 보지 않았다(Unknown). 헤드리스 SwiftShader 값은 휴대폰 값이 아니다.
- 엔진은 유닛 주인을 몰라, 앱이 남의 유닛을 고르면 그 앞도 옅어진다(Assumed: 지금 앱은 내 유닛만 고르고 따라간다).
- 땅 잔소품 몫·장식 소품 비중은 [임시](눈으로 맞춤). 설정 칸으로 빼지 않았다.

## 사용자 결정 대기
- 없음.
