# 2026-11-16 묶음 1116g 합치기 (D-564 좌표 이동 2 · D-568 영토 판정 = 1차맵 지도)

- 일시: 2026-11-16 06:00 (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `16-0410-map-coords-2`·`16-0410-territory-2`, 기획 D-564(2차 답 1641~1643)·D-568, ADR `2026-11-15-unloaded-second-maps.md` "바뀜 (D-564)"·`2026-11-16-territory-judgement-map.md`(새)·`2026-11-03-territory-layer.md`·`2026-11-07-planet-view.md` "바뀜 (D-568)", 질문 1901~1908(`docs/questions/2026-11-16-map-coords-2.md`)·1921~1930(`docs/questions/2026-11-16-territory-2.md`)

## 한 일
- 통합 가지(main 603a1be + 1116f 배포 기록 7815f0a)에 줄기 둘을 차례로 `--no-ff`로 합쳤다(둘 다 바탕 c24f46c = main c4182f5 + 1116e 배포 기록).
  1. `work/map-coords-2`(6d3ca1a) → 628cd7b: 좌표 유닛 조우(전쟁 중인 두 나라 좌표 유닛이 같은 띄우지 않은 2차맵에 서면 멈춰 세계 전투, `travel/encounter.ts`·`encounterWorld.ts`), 좌표 구간 지형 감속(`travel/coordPace.ts`), 탐사만 한 2차맵은 내 유닛이 있어야 열림(`world/vision.ts canView`), tRPC `WorldTravelStop`에 `encounter`.
  2. `work/territory-2`(f19fc82) → 32dd383: 영토 판정 = 1차맵 지도(`@terra/shared/territoryMap` `claimAt`·`provinceAt`, 옛 볼록 껍질 판정 지움), 건물 도시(`facilities/places.ts cityAt`) = 지방 → 사업장 소득세 귀속·재료 자리, 칸 표는 처음 찾을 때 셈(30초 캐시).
  3. 02f5e0d: 합친 `world/world.ts`가 1,001줄(`split("\n")` 셈) → 영토 서비스 입력 셋(`rules`·`mapValues`·`catchment`)을 `territory/catchmentRules.ts territoryJudgeOf`로 묶어 998줄(`wc -l`).
- 최종 판: 프로토콜 **46**(최소 **45**) 그대로, 팩 **core@113**(main 112 위로 territory-2의 설정 칸 설명 바뀜 하나, 줄기 판 114는 쓰지 않음), `SIM_VERSION` **55** 그대로. 이번에 처음 오르는 `id-changes.json` 줄은 없다(두 줄기 모두 그 파일을 바꾸지 않음).
- 마이그레이션 없음. 합친 뒤 `db:generate` = No schema changes(Verified).

## 손으로 푼 곳
- `docs/WORKLOG.md`(두 번): 받은 쪽 → `pnpm docs:index`.
- `content/core/manifest.json`(territory-2): main 112 / 줄기 114 → **113**. `tuning.json`은 충돌 없이 합쳐짐(바탕 c24f46c 이후 main은 그 파일을 바꾸지 않았다).
- `apps/server/src/facilities/service.ts`(territory-2 × main 1116f): main이 만들기 입력 타입 `FacilityServiceOptions`를 `facilities/serviceTypes.ts`로 옮겼고(1116f 1,000줄 상한), territory-2는 옛 자리에 `province` 칸을 더했다 → 옛 자리 블록은 지우고 `province?: PlaceWorld["province"]`를 `serviceTypes.ts`의 `FacilityServiceOptions`에 더함(`places.ts`에서 타입만 가져옴). `createFacilityService`가 `options.province`를 `places`에 넘기는 줄은 줄기 그대로.
- `apps/server/src/worldMap/reads.ts`(territory-2 × main 1116f): import 충돌 — main의 `houseIdentityOf`·`houseTiesOf`와 territory-2의 `territory/catchmentRules.ts` 가져오기를 모두.
- `apps/game/messages/{ko,en}.json`: 충돌 없이 합쳐짐(7,915키 ko·en 일치, JSON 유효). 첫 `pnpm check`가 린트에서 새 키 3개(`dev_territory_legend_territory`·`dev_territory_source_beacon`·`world_travel_stopped_encounter`)를 못 찾아 멈춤 → paraglide를 다시 만들고(생성 파일, git 밖) 다시 돌려 통과.
- **파일 크기**: `world/world.ts` 1116f 993 + map-coords-2 +3 + territory-2 +5 → 1,001(검사 셈) → 위 3번으로 998(`wc -l`, 검사 셈 999). `app.ts` 990, `travel/service.ts` 980, `facilities/service.ts` 960, `territory/service.ts` 733.

## 리셋 필요 여부: 필요 없음
- 저장 모양(표·칸)이 그대로다(마이그레이션 없음). 영토 판정은 저장하지 않고 켤 때 새 규칙으로 셈한다.
- territory-2: 옛 규칙으로 놓은 비콘이 새 규칙에서 남의 영토 안이 되어도 지우지 않는다(D-512 335 선례, 질문 1925). 이미 지은 건물의 시설 줄 도시는 그대로 — 새로 정하는 곳(소득세 귀속·재료 자리)만 지방 기준이 된다. 배포 직후 일부 사업장의 세금 귀속 도시가 바뀌어 보일 수 있다(의도한 D-568 동작).
- map-coords-2: 배포 전 좌표로 가던 유닛은 저장한 나타날 시각 그대로 잇는다(배율은 다음 구간부터). 탐사만 한 2차맵을 보던 화면은 다시 접속하면 열리지 않는다(규칙 바뀜, 자료 바뀜 아님).

## 칸 표 셈 부하 주의 (territory-2)
- 판정(`claimAt` 1~7µs)·배치 셈(수 ms~수십 ms)은 가볍지만, 칸 표(`rasterizeTerritory`)는 메인 스레드에서 국가 16 × 도시 3 × 비콘 3 세계 약 0.56초, 비콘 480개 약 1.7초, 비콘 1,024개 약 3.2초다(줄기 측정, 개발 컨테이너).
- 칸 표가 필요한 조회(개발 영토 화면·이동 확인 위험 구간)에서만 셈하고 30초 캐시한다. 지금 NAS 세계(세력 16·도시 49, 1116f 배포 nas-metrics)는 0.5초 남짓 구간으로 본다(Assumed: 비콘 수를 재지 않음). 이동 확인이 잦으면 30초마다 한 번 루프가 그만큼 멈출 수 있다 → 배포 뒤 nas-metrics 루프 p99·최대를 본다. 워커로 옮기는 것은 질문 1930.
- 부팅 끝에 배치를 한 번 셈해 둔다(`territory.warm`).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json`, `apps/server/src/facilities/service.ts`·`serviceTypes.ts`, `apps/server/src/worldMap/reads.ts`, `docs/WORKLOG.md` | 합치기 충돌 풀기(위) |
| `apps/server/src/world/world.ts`, `apps/server/src/territory/catchmentRules.ts` | 1,000줄 상한 — 영토 판정 규칙 셋 `territoryJudgeOf` |
| `docs/worklog/2026/11/16-0600-batch-1116g-merge.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- 영토 모양 규칙은 `packages/shared/src/territoryMap.ts` 한 곳(서버·화면 공용). 영토 서비스에 판정 규칙을 더하면 `territory/catchmentRules.ts territoryJudgeOf`에.
- 좌표 조우 적대 규칙은 `travel/encounter.ts`(띄운 2차맵 자동 조우를 만들면 같이 쓴다, 질문 1901).
- 다음 프로토콜 판(47)은 최소 판 46. 다음 마이그레이션의 `prevIds`는 1116f의 두 끝(`house_units`·`facility_gather_tier`)을 모두 포함한다(이번 묶음은 마이그레이션 없음).
- 파일 크기: `world/world.ts` 998·`app.ts` 990·`travel/service.ts` 980·`db/schema.ts` 998 — 새 일은 다른 파일로.

## 검사 (Verified)
- `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안): 첫 실행 린트(paraglide 오래됨) → 다시 만든 뒤 둘째 실행 파일 크기(`world.ts` 1,001) → 고친 뒤 셋째 실행 통과: 포맷·린트·타입·경계·크기·다국어(7,915키)·디자인 값·콘텐츠(core@113) 통과, 시험 파일 744/744, 시험 5,597/5,597.
- `pnpm check:content 603a1be`: core@113 (9f85222a2f9b) 단계 1·2·4a·4b 통과.
- `pnpm check:docs 603a1be`: 통과.
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,090 B / 상한 131,416 B.
- `pnpm --filter @terra/server db:generate`: No schema changes.

## 화면 시험
- 통합 판(02f5e0d 빌드, 헤드리스, 잠금 안)에서 세 번에 나눠 돌림. 사진: `E2E_SHOTS_DIR`(작업 공간 밖 임시 폴더 `scratchpad/1116g-shots/`). `map-travel` spec은 저장소에 없다 — 좌표 이동 화면은 `play-map`·`seamless`가 본다.
  - Verified territory·planet-view·vision: 37 통과·1 건너뜀(측정)·1 실패(23.9분).
  - Verified play-map·seamless·boats: 32 통과·1 건너뜀(16.1분).
  - Verified facilities·economy·building-screen: 37/37(13.3분).
  - 합 106 통과·2 건너뜀·1 실패.
- **실패 1 = `vision` "경계 너머 보기"(끌기 16번, 240초 시간 초과) — 이 묶음 회귀가 아니다**(Verified): main 603a1be를 따로 작업 트리에 받아 그 시험만 돌려도(`--grep "경계 너머"`, 같은 잠금 안·혼자) 똑같이 끌기 중 240초 시간 초과였다. map-coords-2 줄기 기록의 두 번 실패와도 같은 모습이다.
  - main 실행 추적(trace)에서 본 것(Verified): 끌기 15번이 모두 실제로 들어갔고(한 번에 끌기 8걸음 약 6.4~7.3초, 입력마다 0.5~1초 — 헤드리스 SwiftShader에 이웃 8장), 끌기 한 바퀴가 약 12.5초라 16번이면 240초를 넘는다. 그런데 15번 끈 뒤에도 `data-view-map`이 "1,0"이 되지 않았다. 실패 사진은 확대 "2차맵 5/6"·처음 자리 근처 화면에 "운영자: E2EDev · 내 사이보그 선택됨. 땅을 누르면 그곳으로 보냅니다" 안내가 떠 있다.
  - 그래서 원인은 느린 그리기만이 아니라 끌기가 화면을 옮기지 않는 것으로 본다(Assumed: 자유 시점인데 끌기가 사이보그 선택·명령 쪽으로 가거나, 5/6 확대에서 한 번 끄는 거리가 짧음). 마지막으로 통과한 기록은 2026-11-12(`12-2130-map-hud`)라 그 뒤 묶음 어딘가에서 생겼다(Unknown — 가르지 않음). 따로 고칠 일로 넘긴다.

## 미검증·TODO·알려진 문제
- 줄기 TODO는 줄기 기록에 있다: 좌표 조우 전체 흐름(실제 월드·DB·NPC 런타임 전쟁)은 단위 시험으로만, 조우 틱 NAS 부하 Unknown, 숲 밀도 = 숲 칸 몫 가정, 강·비탈 미반영(1903). 영토 — 칸 표 메인 스레드 셈(위), 안개로 화면과 판정이 다를 수 있음(1928), `provinceAt`은 30초 늦게 들 수 있음.
- territory-2 줄기는 `devFacilityGrant` 변경을 되돌린 뒤 전체 `pnpm check`를 다시 돌리지 않았다 → 이번 묶음 `pnpm check`(DB 포함, `ruins.db.test.ts` 포함)로 확인했다(Verified).
- 두 줄기를 함께 돈 운영 세계(좌표 조우 + 지방 세금)는 NAS에서 보지 않았다(배포 뒤 nas-metrics). 휴대폰에서 보지 않았다.

## 사용자 결정 대기 (기획 세션에 보낸다)
- 질문 1901~1908(좌표 이동 2: 띄운 2차맵 위 적끼리 조우, 조우 전투맵, 좌표 구간 지형 배율 항목, 조우 상대, 조우 간격·쉬는 시간·한 번 수, 연 화면에서 유닛이 떠나면, 탐사만 한 띄운 2차맵, 조우로 멈춘 이동) — 추천대로 [임시].
- 질문 1921~1930(영토 판정 2: 영토 밖 건물의 도시, 새 도시 겹침, 시가지, 판정·표시 같은 설정 칸, 옛 비콘, 내 영토 안 비콘, 2차맵 건설 땅, 안개, 결과 코드, 칸 표 셈 비용) — 추천대로 [임시].
