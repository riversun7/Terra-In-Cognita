# 대륙 배치: 초대륙·대륙 몇 개·여러 대륙·군도·한쪽 반구와 대륙 수

- 일시: 2026-10-31 15:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-31-continent-layouts.md`(제안, 새로), ADR 36·38 한 줄씩, PLAN 5.3·6.2·13장. 가지 `work/continent-shapes`(main `7bec7cb`에서, 화면 일 전에 main `1a6feba`까지 합침). 앞 기록 `31-1340-user-decisions-library-space.md`

## 한 일
사용자 의견(원문은 ADR): 판 개수를 대륙 수로 읽었고 "2개를 눌러도 여러 개", 1개가 없다. 고른 모양 넷(초대륙·대륙 몇 개·여러 대륙·군도·한쪽 반구)을 넣고, 지금 방식(노이즈)도 남겼다.
- 데이터: 행성 정의에 선택 필드 `continents { layout, count? }`. 없으면 노이즈 배치 그대로라 팩 두 행성의 출력·정의 해시·캐시가 같다. `presets.plates`는 그대로(편집기 단계 줄에서만 뺌).
- 생성기: 대륙을 꽃잎(타원) 합집합으로 직접 그리고 넓이를 맞춰 바다 틈을 두고 놓는다(`continents.ts`·`continentShapes.ts`). 그 값을 대륙성으로 쓰고 뒤 단계는 그대로. 판은 대륙 닻으로 옮기고 땅 쪽으로 끈다. 대륙 배치의 열곡은 땅을 바다 밑까지 깎지 않는다.
- 편집기: 해수면 아래 대륙 모양 줄(누르면 바로 적용) + 대륙 수 슬라이더([적용]을 기다림). 판 개수는 세부 수치의 "판 개수(산맥·해구 자리)".
- 측정 도구: `bench`·`render`·`variety`에 `--continents <배치>[:수]`, `variety`는 시드마다 큰 땅덩어리 수·섬 수·땅 반구 몫도 찍는다.
- 개발 순서: 설정 풀기·정의 읽기·콘텐츠 스키마·서버 정의 해시·편집기 모델은 시험을 먼저 쓰고 고쳤다(빨강 → 초록). 생성 방법(꽃잎·자리·판 닻)은 F6 훑기 스크립트(배치 4 × 대륙 수 7 × 시드 8)로 여러 번 바꿔 본 뒤 성질 시험을 붙였다.

## 검사·측정 (Verified, 이 작업 트리, Node 24.22.1)
- `TEST_DATABASE_URL=… pnpm check` 통과: 시험 파일 203개·시험 1,962개(DB 시험 포함). `pnpm check:content main`·`7bec7cb` 호환 통과(core@3 그대로).
- 출력 그대로: 골든 F5 극단 `22051c78`, F5·F6 팩 `884e2b28`·`6d0b4b25`, 편집 전용 행성 F5 `95709b4b`(새로 고정), 서버 F5 고정값 `884e2b28`, 판 번호·대륙 지각 해시·실수 지문, bench F7 `f98bbce8`·F9 `6fe88527`. 서버 정의 해시 `s2_test_planet` `e04dd3cb…`·`s2_editor_planet` `00b0ffd1…`가 main checkout과 같다(새로 고정). `GENERATOR_VERSION` 3 그대로.
- 대륙 수(판 구조 + 바다 판정, 큰 땅덩어리 = 땅의 3% 이상 8이웃 덩어리): F6 224번 중 어긋남 3번(대륙 수 8·10에서 ±1), F7 96번 0번, F9 24번 0번. 시험 `continents.test.ts`(F6 시드 3개: 수 1은 모든 배치, 수 N 12가지, 10은 ±1, 초대륙 한 덩어리 ≥ 90%, 반구 몰림, 크기 분포, 섬, 3,000m 넘는 산맥, F5·F6 땅 일치 ≥ 90%, 결정성, 메타·꼭짓점).
- 대륙 배치 골든(F5 시드 1): 초대륙 1 `6ff5eb90`, 지구형 3 `e5519d0b`, 군도 6 `ffc2a39f`, 반구 3 `0468cfa8`, 지구형 1 `57410508`.
- F9 시간(bench, 부하 2.4~4.7, 번갈아): 기본 길 앞(main) 9.68·10.04·10.18초 / 뒤 9.87·10.08·9.91초(같은 때 다른 차례 10.66·10.31·10.00초). 대륙 배치 지구형 3 11.55·11.38·12.36초, 초대륙 11.06, 군도 6 11.82, 반구 3 11.51초. F7 기본 0.92 → 지구형 1.05초. 판 구조 단계 프로파일 5.7 → 6.7초(대륙성 계산이 대부분).
- 메모리(F9, 단계 끝 gc() 뒤 살아 있는 타입 배열 최대): 기본 141.5·147.9MiB, 지구형 141.6·141.5, 초대륙 141.6, 군도 159.5MiB. 실행마다 ±15MiB쯤 흔들려 같은 범위로 본다. bench의 최대 RSS 기본 312MiB·지구형 314MiB.
- 반복 검사 F7 × 팩·1·42(`variety 7 pack,1,42 --continents …`): 막는 지표 11개 중 실패는 초대륙 시드 20261029의 "1° 띠의 가장 흔한 바이옴" 0.576(문턱 0.55) 하나. 행성끼리 구별 노이즈 0.95, 배치 0.71~0.81. 초대륙 사막 몫 22~29%(노이즈 11~14%). 결과 JSON: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/continent-shapes/variety/`.
- 판 경계 몫(F6 시드 3개): 판 닻·땅 끌림 전 안데스형 0~3%·열곡 14~28% → 뒤 지구형 안데스형 3~4%·열곡 10~15%, 군도 안데스형 6~8%, 초대륙 충돌 10~25%(노이즈 안데스형 6~10%·열곡 5~11%).
- 화면 시험 `e2e/planet-editor.spec.ts` 12개 통과(첫 실행 11 통과 + 새 대륙 모양 시험 실패 1 → 고쳐 다시 1 통과). 실패는 [되돌리기]·노이즈 복귀가 기억한 결과를 다시 그려 받은 차례가 앞 번호로 돌아간 것(정상 동작, 시험 기대를 고침).
- 사진: 편집기 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/continent-shapes/editor-shots/` (`planet-editor-390|1440-<테마>-<언어>-continents.png` 8장 + 기존 장면). 대륙 모양 그림(F7, 시드 1·42): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/continent-shapes/shots/` — `noise.png`·`supercontinent.png`·`earthlike.png`·`scattered.png`·`hemisphere.png`(지구본 두 면 + 바이옴 경위도), `all-concepts.png`(한 장), `count-slider.png`(대륙 수 1·2·3·4·6, 초대륙 3, 군도 2), `render/<배치>-<시드>/`(render 도구 결과 전체).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/planetDefinition.ts`·`planetPresets.ts`(+시험)·`index.ts` | 배치 종류·대륙 수 범위·기본 대륙 수·`resolveContinentLayout` |
| `packages/content/src/schema/planets.ts`(+`validate/planets.test.ts`) | 선택 필드 `continents` |
| `packages/planet/src/generator/continents.ts`(새)·`continentShapes.ts`(새) | 대륙 배치 모델·대륙성 |
| `packages/planet/src/generator/tectonics.ts`·`plates.ts` | 대륙 배치일 때 대륙성·판 닻·땅 끌림·열곡 바닥(기본 길은 그대로) |
| `packages/planet/src/generator/definition.ts`·`types.ts`·`generate.ts`·`index.ts`, `src/tiles/fields.ts` | 정의 읽기·입력·검사·메타 |
| `packages/planet/src/generator/random.ts` | 단계 번호 14·15 |
| `packages/planet/src/generator/continents.test.ts`(새)·`testLandmasses.ts`(새)·`generate.test.ts`·`testVarietyUnit.ts` | 성질 시험·골든·큰 땅덩어리 정의·격자점 지표에 잔 노이즈 |
| `packages/planet/bench/generator.ts`·`render.ts`·`variety.ts`·`testPlanet.ts` | `--continents`, 땅덩어리 보고 |
| `apps/server/src/planet/sources.ts`(+`bake.test.ts`) | 정의 해시에 대륙 배치(있을 때만), 해시 고정 시험 |
| `apps/game/src/editor/planet/editorModel.ts`(+시험)·`SettingsPanel.tsx`·`editorMessages.ts`·`draftExport.ts`(+시험) | 대륙 모양 줄·대륙 수, 판 개수 단계 줄 빼기, 가져오기 검사 |
| `apps/game/messages/ko.json`·`en.json` | 새 키 13개, 판 개수 이름 |
| `e2e/planet-editor.spec.ts` | 대륙 모양 시험·사진 |
| `docs/adr/2026-10-31-continent-layouts.md`(새), ADR 36·38 한 줄, `docs/PLAN.md`, `AGENTS.md`(도구 옵션) | 결정·기록 |

## 함께 바꿔야 하는 파일
- 대륙 배치 출력을 바꾸면: `GENERATOR_VERSION`, `generate.test.ts` 대륙 배치 골든, `continents.test.ts` 기대(수·모양) (합친 뒤에는 PROTECTED 생성기 행 그대로).
- 배치 종류를 더하면: `@terra/shared` `CONTINENT_LAYOUTS`·`CONTINENT_LAYOUT_DEFAULT_COUNTS`(+고정 시험), `continents.ts` `LAYOUT_PARAMS`, 편집기 `CONTINENT_LABELS`·메시지 키, 콘텐츠 스키마 시험 문구.
- 큰 땅덩어리 기준(3%)을 바꾸면 `testLandmasses.ts` 하나, 그리고 `continents.ts`의 작은 조각 상한(대륙 지각 0.8%)·크기 비율 하한을 같이 본다.

## 건드리지 말 것
- 기본 길(대륙 배치 없음)의 계산 순서·노이즈: `tectonics.ts`의 `layout === undefined` 쪽, `plateAt`·`chooseRotation`·`createPlates`. 바뀌면 팩 두 행성이 다시 구워진다.
- 서버 정의 해시에 대륙 배치 칸을 늘 넣지 않는다(없는 행성의 해시가 바뀐다).

## 미검증·TODO·알려진 문제
- 사용자가 네 모양을 보고 고르는 확인: 아직(그림과 편집기 사진을 전달할 것).
- 한쪽 반구 대륙 3개 이상은 땅 반구 몫 0.6~0.8로 지구형(0.57~0.74)과 겹친다. 적도 띠 모양은 넣지 않았다(ADR).
- 대륙 배치 생성은 F9에서 7~17% 느리다(부하 있는 공유 기계, 번갈아 3번). NAS 굽기 시간은 잰 적 없다(대륙 배치 행성은 아직 팩에 없다).
- 휴대폰 실기기에서 대륙 모양 줄·슬라이더를 보지 않았다(헤드리스 390px만). 데스크톱 영어에서 "✓"와 "Supercontinent"가 두 줄로 나뉜다(좁은 3칸, 다른 단계 이름과 같은 규칙).
- 다른 엔진(브라우저)에서 같은 해시인지: Assumed(명세상 같다).

## 사용자 결정 대기
- 네 모양이 원하던 것인지, 기본 대륙 수(1·3·6·3)가 맞는지.
- 한쪽 반구를 더 세게 모을지, 적도 띠 모양을 따로 더할지.
- 초대륙의 넓은 사막(사막 몫 22~29%)을 그대로 둘지(바이옴 표·기후 결정과 함께).
