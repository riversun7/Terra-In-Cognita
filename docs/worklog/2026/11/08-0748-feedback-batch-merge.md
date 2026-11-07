# 사용자 지적·개선 묶음 여섯 줄기 합치기 (세계 배치·채집·지도 보기·공성 결과·부상·조종 후속)

- 일시: 2026-11-08 07:48 (KST)
- 작업 도구: Claude Code
- 관련: 통합 가지 `merge/integration`(시작 9f32385 = main f6d5a9b + `work/unit-control` + 미러 4de8c68). ADR `2026-11-07-world-layout.md`·`2026-11-07-gather-objects.md`·`2026-11-07-planet-view.md`·`2026-11-07-war-outcomes.md`·`2026-11-08-injury.md`·`2026-11-07-play-flow.md`(WP13). 질문 645 사용자 결정(2026-11-08 "다) 제대로 다시")

## 한 일
- 여섯 줄기를 차례로 합쳤다(합칠 때마다 커밋·푸시, 손으로 푼 코드가 있으면 그 꾸러미 타입 검사 뒤):
  1. `work/world-layout` (751be51) — 충돌 `npc/nations.ts`·`persist.ts`·`runtime.ts`: WP12(따르는 나라 도시 이름 `cityNamesOf`·`takenNames`, `nationPresetOf`)와 세계 배치(마을 자리 `pickTownSite`·영토 규칙 `territory`)를 둘 다 남김. 옛 고정 16방위 마을 자리 코드는 세계 배치 쪽(`townSites.ts`)으로.
  2. `work/gather-objects` (39773aa) — 충돌 `SecondaryMapScreen.tsx`(유닛 조종 목록·운영자 모드 + 채집 판·덧그림), `session.ts` 가져오기, 판 주석.
  3. `work/planet-view` (4253fe3) — 충돌 `SecondaryMapScreen.tsx`: 확대 단계 사다리(`ZoomLadder`)를 유닛 조종 줄기가 떼어 낸 성능 판(`MapPerfPanel`) 앞에.
  4. `work/war-outcomes` (a8cf284) — 충돌 `npc/runtime.ts`(마을 자리 검사 `canFound` + 공성 결과 `onWarOutcome` 둘 다 넘김), `sim/societyTypes.ts` 두 고리, `db/schema.ts` 다시 내보내기(채집 상태 표·공성 결과 표).
  5. `work/injury` (d428efa) — 충돌 `session.ts`·`app.ts`·`protocol/messages.ts`·`mapFeed.ts`(채집 `gather_*` + 병원 `hospital_*`), 메시지 ko·en(두 쪽 키 모두, 부상 이름 값은 부상 줄기 것). **채집 중 부상 이음**(부상 줄기가 비워 둔 고리, ADR 부상 5절): `world/unitCondition.ts createGatherInjury()` — 직무 정산과 같은 `workInjuryStage`·시드·경계 번호로 (지난번, 지금] 안 작업 주기 경계마다 굴림(한 번에 마지막 24경계). `gather/service.ts`가 캐기 끝마다 부르고(`GatherDeps.workInjury`, `gather/world.ts`가 잇는다) 빨강이면 줄을 끝냄(`interrupted`). 시험 `world/gatherInjury.test.ts` 4개, 부상 ADR "5-1".
  6. `work/control-move3` (0ba563a) — 충돌 `SecondaryMapScreen.tsx`: 자료 흐름을 채집 덧그림 → 카메라 범위 → 엔진으로 잇고 효과 의존성 둘 다. **의미 충돌**: `travel/raid.ts`(건너뛰는 동안 습격)가 부상 줄기가 지운 `DOWNED_INJURY`를 써서 타입 검사가 깨짐 → 세계 전투 결과와 같은 부상 판정 `combatInjuryStage`로(쓰러짐 확률 출발값 1000‰라 늘 다침). `raid.test.ts`는 다친 것만 봄, play-flow ADR WP13 줄에 기록.
- 판 합치기(main = 프로토콜 16·core@50·SIM 19):
  - 프로토콜 **17(최소 16)** — 주석 하나에 유닛 조종(`stop_unit`·`not_owner`·`unit_stays`)·채집·건물 들어가기(`gather_start`·`gather_stop`·`unit_enter`)·병원 치료(`hospital_treat`·`dev_injure_unit`). control-move3·세계 배치·지도 보기·공성 결과는 메시지 바뀜 없음.
  - 콘텐츠 팩 **core@51** — 다섯 줄기가 모두 51이라 판 하나(`tuning.json`·`facilities.json` 등은 자동 합침, `id-changes.json`은 공성 결과의 `d510_raze_aggression` 기록 하나가 뒤에 붙음). `check:content origin/main` 통과(core@51 해시 082b409955ee).
  - `SIM_VERSION` **20** — 주석 하나에 숲 들어가기(채집 줄기가 19로 적었으나 main 19 = WP12 특산)·공성 결과 셋(20)·부상 4단계(21). PLAN 14장 줄·채집·부상 ADR에 "합칠 때 20" 표시. 판 번호를 값으로 보는 시험은 없었다(프로토콜 시험은 17·최소 = 현재 − 1 그대로).
- 마이그레이션: 폴더 그대로(`gather_object_states`·`war_outcomes`·`injury_heal`), 합친 뒤 `db:generate` = "No schema changes".
- 질문 645 사용자 결정(2026-11-08 원문 "다) 제대로 다시"): NAS 시험 세계는 따로 만드는 도구로 세계 자료를 지우고(계정은 남김) 새로 시작 → `ops/compose.yml` `WORLD_RELAYOUT` "0". 질문 문서 상태 줄·645 줄, 세계 배치 ADR "사용자 결정 (질문 645)"·확인 대기 줄, PLAN 14장 세계 배치 줄에 적음.

## 검사 (한 번 묶음 + 실패한 몫만 다시)
- 설치·메시지 생성 → `TEST_DATABASE_URL=… pnpm check`: 포맷·린트·타입·경계·크기·다국어(4,617키)·디자인 값·콘텐츠 통과, 단위 시험 **504파일 3,919개 가운데 3개 실패** → 고침(아래) → 그 파일 + `apps/server/src/npc` 전체(DB 포함 9파일 34개)·게임 `mapUnits.test.ts` 8개 다시 통과.
- `check:docs origin/main`·`check:content origin/main` 통과, `pnpm build`·`check-pwa` 통과, `check:bundle` 첫 화면 JS **106,356 B**(상한 131,416 B, gzip 9단계 7파일).
- 화면 시험(15파일: first-login·play-map·territory·unit-control·vision·ruins·temple·economy·labor·produce + 새 control-move3·gather·injury·planet-view + 바뀐 faction): 첫 돌림 **150개 중 131 통과·19 실패·1 건너뜀(측정)**(26.5분). 고친 뒤 실패한 6파일(gather·labor·planet-view·play-map·territory·vision)만 다시: 58개 중 54 통과·labor 4 실패 → labor 고친 뒤 labor만 **4 통과**. 마지막 상태로 실패 0.
- 고친 것:
  - 단위 시험 3: `npc/persist.ts` — 세계 배치의 자리 검사(`canFound`)가 마을 자리를 미리 `places`에 넣으면 `saveCity`가 이름을 붙이지 않았다(601 나 `cityNames.db.test.ts`) → 처음 저장하는 도시면 늘 `nameCity`. `worldMap/mapUnits.test.ts`(빨강은 시간이 지나면 노랑 2로 내려가 명령 가능)·게임 `map/mapUnits.test.ts`(부상 2 = "노랑 부상")는 부상 4단계에 맞춤.
  - 2차맵 화면 시험 smallTapTargets(gather 3·planet-view 2·play-map 1, 뒤따른 play-map 이동 시험 3은 연쇄): 채집 표시를 소수 px로 옮겨 44px 상자가 43.99997px로 재졌다 → `gather/gatherOverlay.ts`가 도시 표시처럼 정수 px로 놓는다(제품 코드).
  - territory 5: 앞 시험이 남긴 복귀 요약 창이 지도를 가림 → `page.addLocatorHandler`로 Esc(recruit.spec.ts와 같다, 시험 차례 문제).
  - vision 1: 경계 너머 끌기가 빽빽한 채집 표시(단추) 위에서 시작해 지도가 끌리지 않음 → 캔버스에 닿는 높이에서 끌기 시작(시험).
  - labor 4: 세계 배치로 player 시작 도시가 시험 2차맵 줄 밖이라 임대·구인 받기(같은 2차맵 규칙)에 쓸 유닛이 없음 → 시험 건물·admin 일꾼을 player 사이보그 2차맵(`world.myPosition`)에 둔다(시험).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/npc/nations.ts`·`persist.ts`·`runtime.ts` | WP12 이름 + 세계 배치 마을 자리 + 공성 결과 고리를 함께, 미리 잡은 마을 자리도 이름 |
| `apps/game/src/map/SecondaryMapScreen.tsx` | 유닛 조종·채집·확대 단계·카메라 범위를 한 화면에(636줄) |
| `apps/server/src/session.ts`·`app.ts`, `packages/protocol/src/messages.ts`·`version.ts`, `apps/game/src/map/mapFeed.ts` | 채집·병원 메시지·관문 둘 다, 프로토콜 17 주석 하나 |
| `packages/sim/src/version.ts`·`simulator/societyTypes.ts`, `apps/server/src/db/schema.ts` | SIM 20 주석 하나, 두 고리·두 표 |
| `apps/server/src/world/unitCondition.ts`·`gather/service.ts`·`gather/world.ts`·`world/gatherInjury.test.ts` | 채집 중 부상 이음 |
| `apps/server/src/travel/raid.ts`·`raid.test.ts` | 지워진 `DOWNED_INJURY` → `combatInjuryStage` |
| `apps/game/src/map/gather/gatherOverlay.ts` | 표시 자리 정수 px |
| `apps/server/src/worldMap/mapUnits.test.ts`, `apps/game/src/map/mapUnits.test.ts` | 부상 4단계 단계·문구 |
| `e2e/territory.spec.ts`·`vision.spec.ts`·`labor.spec.ts` | 복귀 요약 처리기, 표시 피해 끌기, 사이보그 2차맵에 시험 건물 |
| `apps/game/messages/ko.json`·`en.json` | 두 쪽 키 모두(4,617키, 겹친 키 없음) |
| `ops/compose.yml`, `docs/questions/2026-11-07-world-layout.md`, `docs/adr/2026-11-07-world-layout.md` | 질문 645 사용자 결정, `WORLD_RELAYOUT` "0" |
| `docs/PLAN.md`, `docs/adr/2026-11-08-injury.md`·`2026-11-07-gather-objects.md`·`2026-11-07-play-flow.md`, `docs/WORKLOG.md` | 14장 줄 모두 남김·합친 판 표시, 채집 부상 이음·습격 부상 기록, 목차 |

## 함께 바꿔야 하는 파일
- 새 줄기가 프로토콜·팩·SIM 판을 올리면 이번 합친 값(17·core@51·20) 위에서 올린다.
- 채집 표시처럼 2차맵 위에 DOM 단추를 놓는 덧그림은 자리를 정수 px로 둔다(`CityOverlay.tsx`·`gatherOverlay.ts`).
- 화면 시험이 player 사이보그와 같은 2차맵을 가정하면 `S1_TEST_MAP_KEY` 대신 `world.myPosition`의 2차맵을 쓴다(세계 배치 뒤 시작 도시는 국가 자리).

## 건드리지 말 것
- 올라간 마이그레이션 폴더는 고치지 않는다.
- `world/relayout.ts`(옛 세계 옮기기)는 꺼 둔 채 남긴다(NAS는 세계 새로 시작).

## 미검증·TODO·알려진 문제
- 1,000줄 가까운 파일: `apps/server/src/world/world.ts` 979, `packages/sim/src/index.ts` 986, `apps/server/src/db/schema.ts` 951, `apps/server/src/world/secondMap.ts` 932, `apps/server/src/holdings/service.ts` 926, `apps/server/src/app.ts` 921, `apps/server/src/gather/service.ts` 864. 다음에 더하는 줄기는 나눈다.
- 고친 뒤 화면 시험은 실패한 파일만 다시 돌렸다. labor 시험이 이제 끝까지 돌아 player 사이보그를 그 2차맵 시설에 고용했다가 해지하는데, 같은 실행에서 뒤에 도는 파일(planet-view·play-map·produce 등)과의 차례 영향은 15파일 전체를 다시 돌리지 않아 Unknown.
- 빽빽한 채집 표시(숲 2차맵)에서 손가락을 대고 끌면 지도가 끌리지 않고 표시가 눌린다(시험은 피해서 끌게 고침). 화면 동작은 그대로 — 채집 줄기 후속으로 끌기 통과를 볼 것.
- 채집 중 부상: 서버 시험(고리 단위)만 했고, 실제 채집 줄에서 경계를 넘겨 다치는 것은 화면·DB 시험으로 보지 않았다(1시간 경계라 시험 시간 안에 오지 않음).
- 습격 부상이 고정 단계(중상)에서 단계표(흰·노랑·빨강)로 바뀌었다 — 질문 700(습격 기록)과 함께 기획 확인 대상.
- main이 그사이 39eeb01(미러 ae7a41d, D-522 NAS 시험 세계 다시 씨앗)로 나아갔다. 이 통합 가지에는 합치지 않았다(다음 main 합치기 때).

## 사용자 결정 대기
- 없음(질문 645는 답함).
