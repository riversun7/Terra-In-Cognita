# NPC 휴먼 낮밤 일·이름·처음 스탯·하루 생필품 (WP-NPC4)

- 일시: 2026-11-08 16:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-play-flow.md` "WP-NPC4 (2026-11-08)", 질문 `docs/questions/2026-11-08-npc-humans-2.md`(820~824, 확인 대기), 기획 정리 D-523 포인터(기술 질문 770~813 모두 기술 추천: 770 나·773 나·774 나·781 나, `docs/design/02_Decision_Log.md`), 가지 `work/npc-humans-2`(시작점 main `d5ba2aa`), 앞 줄기 `docs/worklog/2026/11/08-1400-npc-humans.md`·`08-1400-npc-leader.md`

## 한 일
- **낮밤 일(770 나)**: 일터를 받은 NPC 휴먼은 그 2차맵 지역 시각의 낮(설정 칸 `npc_work_start_pm` 250 ~ `npc_work_end_pm` 750 [임시] = 06:00~18:00)에 일터, 밤에는 집 둘레를 걷는다. 지역 시각은 2차맵 빛과 같은 셈 — 공용 달력 `@terra/shared/planetCalendar` `localSolarHours`(새 함수, 엔진 `planet/sky.ts localSolarHours`가 이 함수를 부르게 바꿈) + 2차맵 경도(`npc/humanPlaces.ts mapLongitudeDeg` — 엔진 `secondMapPlace`와 같은 칸 가운데 방향 경도). 휴먼마다 출근·퇴근을 지역 0~1시간(`WORK_JITTER_PM` 42‰ ≈ 실제 2.5분) 늦춰 흩는다. 옛 30분 주기(`WORK_CYCLE_MS`·`WORK_SHIFT_MS`)는 지웠다. 쉬는 시간·일터 네모는 그대로.
- **빨리 보기(시험·개발)**: 설정 칸 둘을 개발자 패널(`/dev/tuning`, 실효 값 — 서버가 휴먼 자리를 맞출 때마다 읽음, `tuning/scope.ts`에 더함)에서 0·1000으로 두면 늘 일터, 같은 값이면 늘 집. 하늘 주소 매개변수 `?second-map-time=`은 기기 화면만 멈추는 값이라 서버 권위 움직임을 바꿀 수 없어 쓰지 않았다(한 사람의 주소가 세계를 바꾸면 안 됨). 서버 시험은 시각을 직접 넣는다(`bots.test.ts`·`secondMap.test.ts`).
- **휴먼 이름(773 나)**: 팩 국가 프리셋 새 칸 `humanNames`(`given`·`family` 조각, 번역 안 함, 16나라 모두 이름 8·성 6 [임시]). 규칙 [임시] "이름 성", 유닛 ID 해시로 결정적(`npc/humanNames.ts`), 목록 = 그 휴먼 주인 세력이 따르는 나라(도시 이름과 같은 길). 정부 판 시장 줄 `GovernmentMayor.name` → "이름 · Lv레벨"(새 키 `government_mayor_named`, ko·en), 지도 한눈 정보는 NPC 휴먼이면 종류 `human` + 이름(`MapUnitSource.npcHuman`, 시험 줄 봇은 그대로 `test_unit`). 런타임 `humanName(unitId)`, 국가 프리셋은 월드 설정 `npc.presets`를 런타임에 넘김(`world.ts` 한 줄).
- **처음 인구 스탯(774 나)**: `@terra/sim` `rollFoundingProfile`(그 행정 레벨 구인 카드 한 장과 같은 굴림, 레벨 0은 Lv1 [임시])·`foundingProfileOf`(세력·사회 흐름 유닛 차례 1). 시뮬 세력·사회 차리기가 처음 휴먼에, 서버 런타임이 켤 때 저장된 스탯이 없는 휴먼(처음 인구·들인 봇·옛 세계 휴먼)에 같은 함수로 넣는다. 휴먼 저장 줄 비교에 스탯 있음을 더해 채운 휴먼을 처음 저장이 쓴다. 나이·수명은 기존 규칙 그대로(이미 저장돼 있음). `SIM_VERSION` 21(시뮬 지표 출력은 그대로 — sim 시험 704개가 바뀌지 않고 통과).
- **하루 생필품 저장(781 나)**: 런타임 하루 끝(사회 하루 끝 뒤, 도시 경제 하루 줄을 비우기 전)에 도시마다 `foodPmOf`(하루 끝 만족도가 쓴 값)를 `npc/cityDayStore.ts`에 적고 `world_cities.necessities_pm`(새 칸, 쓰기 표 `cityDay` — 도시 행 쓰기와 따로)에 쓴다. 켤 때 읽는다. 정부 판은 이 값을 읽고 안내 문구를 "세 값 모두 하루 끝(UTC 0시)에 셈한 같은 날의 값"으로 바꿨다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/planetCalendar.ts`, `packages/engine/src/planet/sky.ts` | 지역 시각 셈을 공용 함수 하나로(엔진은 부르기만, 시험 값 그대로) |
| `apps/server/src/world/bots.ts`·`bots.test.ts`, `world/secondMap.test.ts` | 일하는 때 = 지역 시각 창(`WorkShift`·`atWork`·`localDayPm`), 옛 주기 상수 지움 |
| `apps/server/src/npc/humanPlaces.ts`·`humanPlaces.test.ts` | 일터 휴먼에 2차맵 경도·설정 칸 시각을 싣기(`mapLongitudeDeg`) |
| `packages/sim/src/society/worldSeed.ts`·`tuningWorldSeed.ts`, `content/core/tuning.json`, `apps/server/src/tuning/scope.ts` | 설정 칸 `npc_work_start_pm`·`npc_work_end_pm`(실효 값으로 읽음) |
| `packages/content/src/schema/economy.ts`, `content/core/nation_presets.json`·`manifest.json`(core@54), `apps/server/src/npc/nations.ts`·`presets.ts`, `npc/humanNames.ts`(새)·`humanNames.test.ts`(새) | 휴먼 이름 목록·규칙 |
| `packages/sim/src/society/recruitment.ts`·`recruitment.test.ts`, `simulator/society.ts`·`society.test.ts`, `simulator/world.ts`, `index.ts`(988줄), `version.ts` | 처음 휴먼 스탯 굴림(시뮬·서버 같은 함수), `SimUnit.recruit` 바뀔 수 있는 칸, `SIM_VERSION` 21 |
| `apps/server/src/npc/runtime.ts`(823줄)·`persist.ts`, `world/world.ts`(914줄) | 켤 때 스탯 채우기, 이름, 하루 생필품 기록, 일하는 시각 넘기기, 프리셋 넘기기 |
| `apps/server/src/npc/cityDayStore.ts`(새)·`cityDay.db.test.ts`(새), `npc/state.ts`, `db/schema.ts`(960줄), `drizzle/20261108062530_city_necessities_day/`(새), `world/persist/tables.ts` | 하루 생필품 칸·쓰기 표·읽기 |
| `apps/server/src/government/reads.ts`·`reads.test.ts`·`cityDay.ts`, `packages/shared/src/government.ts` | 시장 이름, 생필품 = 저장한 하루 값 |
| `apps/server/src/worldMap/mapUnits.ts`·`mapUnits.test.ts`·`reads.ts` | 한눈 정보: NPC 휴먼 = human + 이름 |
| `apps/game/src/government/mayorText.ts`·`mayorText.test.ts`·`MayorFact.tsx`·`GovernmentDay.tsx`, `apps/game/messages/ko.json`·`en.json` | 시장 이름 줄, 하루 값 안내 문구 |
| `apps/server/src/npc/population.db.test.ts`·`leaders.db.test.ts`, `e2e/government.spec.ts` | 처음 인구 스탯·옛 휴먼 채우기·시장 이름 기대값 |
| `AGENTS.md` | NPC 사회 런타임 설명에 낮밤 일·설정 칸 |
| `docs/adr/2026-11-07-play-flow.md`, `docs/questions/2026-11-08-npc-humans-2.md`(새), `docs/PLAN.md` | WP-NPC4 절, 질문 820~824, 14장 줄 |

## 함께 바꿔야 하는 파일
- 지역 시각 셈을 바꾸면 `@terra/shared/planetCalendar localSolarHours` 하나만(엔진 하늘·2차맵 빛·서버 휴먼이 같이 따른다). 2차맵 경도 셈은 엔진 `lighting/secondMapLight.ts secondMapPlace`와 서버 `npc/humanPlaces.ts mapLongitudeDeg`가 같은 식이다(둘 다 고친다).
- 정부 판 시장 칸을 바꾸면 `@terra/shared/government GovernmentMayor`·`government/reads.ts mayorView`·`apps/game/src/government/MayorFact.tsx`·`mayorText.ts`.
- 처음 휴먼 스탯 규칙은 `@terra/sim rollFoundingProfile` 하나(시뮬·서버).

## 건드리지 말 것
- 처음 인구 표시(`population_seeded_at_ms`)·이미 고른 시장(`mayor_unit_id`)을 지워 다시 고르게 하지 않는다(772 가, 질문 823).
- `world_cities.necessities_pm`는 쓰기 표 `cityDay`로만 쓴다(도시 행 `cities`에 넣으면 직전 판 앱과 섞일 때 지워진다).

## 검사·시험 (개발 컨테이너, Node 24.22.1)
- 작업 중(고친 꾸러미만): sim 전체 89파일 704개(바꾸기 전 출력 확인), sim `recruitment`·`society` 시험, 엔진 `sky`·`secondMapLight` 71개, 서버 `bots`·`secondMap`·`humanPlaces`·`humanNames`·`government`·`mapUnits` 시험, DB `population`·`leaders`·`cityDay` 시험(시험 DB PostgreSQL 16), 서버 타입 검사.
- 끝 검사(Verified, 무거운 잠금 안, 시험 DB PostgreSQL 16, 기준 main `d5ba2aa` — origin/main은 그 뒤 문서 커밋 `3db620b` 하나): `TEST_DATABASE_URL=… pnpm check` 통과 — 포맷·린트(`--deny-warnings`)·타입·경계·파일 크기(`packages/sim/src/index.ts` 989줄 — 1,000 아래)·다국어(4,790키)·디자인 값·콘텐츠(core@54)·단위·DB 시험 **534파일 4,062개 통과**. `pnpm check:docs origin/main` 통과, `pnpm check:content origin/main` 통과(core@54, 기준 `3db620b` 호환). 화면 시험 `pnpm e2e government.spec.ts unit-control.spec.ts play-map.spec.ts` **34 통과 / 34**(10.5분). 사진(`E2E_SHOTS_DIR`, 저장소 밖) 정부 대화상자 390 파스텔·다크(한국어)·파스텔 영어를 직접 봄: 시장 줄 "Gloria Ember · Lv1"·만족도 60·스탯 STR 3 VIT 4 / INT 8 WIS 15 / DEX 6 AGI 6(합 42 = Lv1 범위, 기본값 안내 없음), 생필품 충족 "—"(첫 하루 끝 전), 새 안내 문구(ko·en, 영어는 세 줄로 접힘), 넘침 없음.

## 미검증·TODO·알려진 문제
- NAS에서 돌려 보지 않았다(미실행). NAS 세계는 비우지 않고 켜면 옛 휴먼 스탯을 같은 값으로 채운다(Verified: DB 시험에서 스탯을 지운 세계를 켜면 지우기 전과 같은 값). 옛 시장은 그대로(질문 823). 생필품 하루 값은 첫 UTC 0시까지 "—".
- 경로 요청: 긴 길(집 ↔ 일터)이 휴먼 하나당 실제 1시간에 두 번(옛 30분 주기는 네 번)이라 늘지 않을 것(Assumed — 재지 않음). 같은 도시 휴먼이 지역 06:00~07:00(실제 약 2.5분)에 몰려 길을 묻는다.
- 낮은 지역 시각 고정 창이라 위도·계절의 실제 해 뜨는 때와 다르다(질문 820). 이름은 지금 나라 목록이라 도시가 넘어가면 바뀐다(질문 821).
- 화면 시험은 시각을 바꿀 수 없어 낮밤 움직임 자체는 서버 시험으로만 본다(설정 칸으로 개발자 패널에서 눈으로 볼 수 있음 — 미실행).

## 사용자 결정 대기
- 질문 820~824(기획 세션 경유).
