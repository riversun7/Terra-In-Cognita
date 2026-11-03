# 출생 없음 — 행정 건물 구인 카드(D-469): 규칙·시뮬·NPC 판단·서버·유저 고용 명령·개발자 화면, 상속은 소유자에게만

- 일시: 2026-11-03 09:20 ~ 14:30 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-469(D-332·D-412 대체)·49 N45·D-507, ADR `docs/adr/2026-10-31-faction-society-core.md` "바뀜 (D-469 구인 카드)"·`2026-11-01-npc-brain-r5.md`, 옛 코드 AntiGravt01 `0ea5299` `terra-server/routes/building/hq_routes.js`, 가지 `work/recruit`(main `378852d` 합침)

## 한 일
- 옛 `hq_routes.js`를 줄 번호로 대조했다(ADR "바뀜 (D-469 구인 카드)" 1절 표): 토탈 스탯 T1~T3 범위(20~24), 카드 3~5장(177), 12시간 갱신·쌓이지 않음(158·176·187), 6스탯 분배(38~56), 원소 2~3개에 10점(62~80), 비용 = 등급 × 50 + (토탈 − 최소) × 2(105~107), 지갑에서 빼기만(267), 레벨 1(284), 산 카드 빼기(323).
- 판정(`@terra/sim` `society/recruitment.ts`): 카드 굴림(시드 = 세계·도시·고용 주체·창), 비용, 창, 산 칸 비트, 고용한 휴먼 모양(레벨 1·스탯 6·4원소), 4원소 ↔ 12칸. 계수표 `recruit` 칸(49 N45 옛 값, Lv4·5 [임시]).
- 출생을 지웠다(`canBirth`·`birthRoll`, 계수 `birth*`, 팩 `s39_*`, 시뮬 하루 끝 출생). 상속은 소유자에게만(상속세 S22는 도시 국고), 유닛 부모 칸을 지웠다.
- 시뮬 구인(`simulator/societyRecruit.ts`): 도시 주인이 자기 도시 행정 건물(`SimCity.adminLevel`)에서 카드를 사면 값 소각(원장 `recruit`) + 휴먼. NPC 규칙식 `npc/policy.ts recruitPicks`를 판단마다(세율 자리) 돌린다. 하루 줄 `recruited`, 요약 `society.recruited`·`recruitSpent`, `npc.recruits`. 출력 형식 9, `SIM_VERSION` 11.
- 서버: NPC 사회 런타임이 거울 도시 행정 건물 레벨·산 칸(`recruit_draws`)과 구인 휴먼 레벨·스탯·속성(`world_humans`)을 저장·복구, 1분 지표 `npcRecruited`. 유저 구인 서비스(`src/recruit/`): tRPC `recruit.board` + WebSocket `recruit_hire` → `recruit_result`(프로토콜 7, 최소 6), 휴먼 유닛 종류 4.
- 개발자 화면 `/dev/recruit`(구인 카드 시험, 개발 화면 층): 구인 도시 표 → 내 카드(스탯 묶음 막대·속성·값·[고용]) → 도시 주인(NPC) 카드 표. 행정 건물 화면 UX가 없어서 개발 화면으로 만들었다.
- main 두 번 합침: `1938e24`(보유 물건, 프로토콜 6 → 구인은 7, 팩 32 → 33), `378852d`(콘텐츠 켬, 팩 33 → 34, SIM 10 → 11). 마이그레이션은 보유 물건 뒤로 다시 만들었다(`20261103043311_recruit_cards`, 처음 만든 `20261103003938_recruit_cards`는 올리기 전이라 지움). 휴먼·구인 표 정의는 `src/db/populationSchema.ts`(schema.ts 1,000줄 상한).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/society/recruitment.ts`·`.test.ts` | 구인 카드 판정 한 벌(시뮬·서버 같이) |
| `packages/sim/src/society/population.ts`·`rules.test.ts` | 출생 함수 지움, 상속 = 국고 세금 + 소유자 |
| `packages/sim/src/society/coefficients.ts`·`npc/coefficients.ts` | 계수 `recruit`(N45), `npc.recruitTargetPm`·`recruitReservePm`, 출생 계수 지움 |
| `packages/sim/src/npc/policy.ts`·`.test.ts` | 구인 규칙식 `recruitPicks` |
| `packages/sim/src/simulator/societyRecruit.ts`·`.test.ts`, `society.ts`·`societyTypes.ts`·`npcRun.ts`·`world.ts`·`scenario.ts`·`metrics.ts`·`run.ts`·`economyRun.ts`·`waveBattle.ts`·`society.test.ts`·`cli/gardener-cal.ts` | 시뮬 구인 연결, 출생 지움, 도시 `adminLevel`·`recruitDraw`, 유닛 `recruit`(부모 지움), 시나리오 `adminLevel`(기본 1), 하루 줄·요약 칸, 출력 형식 9, 원장 sink에 `recruit` 종류 |
| `packages/sim/src/tuning.ts`·`tuningRecruit.ts`·`tuningNpc.ts`·`tuningChecks.ts`·`.test.ts`·`version.ts`·`index.ts` | N45 칸 표, NPC 구인 칸, 여러 칸 검사 `n45_fit`, SIM 11, 내보내기 |
| `content/core/tuning.json`·`manifest.json`·`id-changes.json` | N45 27칸·NPC 2칸 더함, S39 3칸 지움(기록), T4 단위·범위, 판 34 |
| `packages/shared/src/tuning.ts`·`recruit.ts`·`routes.ts`·`routes.test.ts`·`package.json` | 문제 코드 `n45_fit`, 구인 조회 자료 모양, 주소 `/dev/recruit` |
| `packages/protocol/src/recruit.ts`·`.test.ts`·`messages.ts`·`index.ts`·`version.ts`·`cyborg.test.ts` | 메시지 `recruit_hire`·`recruit_result`, 프로토콜 7(최소 6) |
| `apps/server/src/db/schema.ts`·`populationSchema.ts`·`drizzle/20261103043311_recruit_cards/` | `world_cities.admin_level`, `world_humans.level`·`stats`·`elements`, 표 `recruit_draws` |
| `apps/server/src/world/persist/tables.ts` | 쓰기 대기열 열·표·차례 |
| `apps/server/src/npc/state.ts`·`runtime.ts`·`persist.ts` | 산 칸·행정 건물 레벨·구인 휴먼 저장·복구, 지표 이름 |
| `apps/server/src/recruit/service.ts`·`gateway.ts`·`gateway.test.ts`·`recruit.db.test.ts` | 유저 구인 조회·고용, WebSocket 처리 |
| `apps/server/src/trpc/recruit.ts`·`router.ts`·`context.ts`·`createContext.ts`, `session.ts`·`app.ts`·`world/world.ts` | 잇기 |
| `apps/server/src/world/unitKinds.ts`·`roster/worldUnits.ts` | 유닛 종류 4 = 고용한 휴먼(유닛 화면 종류 human) |
| `apps/server/src/tuning/scope.ts` | N45·T4 칸 live |
| `apps/game/src/editor/recruit/*`, `editor/DevHome.tsx`·`devIcons.tsx`, `shell/routeViews.tsx`, `sections/ComingSoon.tsx`, `map/mapFeed.ts`, `editor/tuning/tuningMessages.ts`·`editor/balance/balanceMessages.ts`, `messages/{ko,en}.json`, `scripts/pwa-build.mjs` | 구인 카드 시험 화면(지연 조각, 미리 캐시 밖), 지도 흐름이 `recruit_result`를 버림, 문구 50개 + 문제 문구 |
| `e2e/recruit.spec.ts`, `e2e/global-setup.ts`·`first-login.spec.ts`·`units.spec.ts` | 화면 시험. 준비 단계 인사를 지금 프로토콜(7)로, legacy(4판 인사) 사이보그는 만들 수 없어 그 시험을 건너뜀, admin 유닛 시험은 시험 일꾼 줄을 골라 봄 |
| `AGENTS.md` | 시뮬·NPC 런타임 명령 설명의 출생 → 구인 |

## 함께 바꿔야 하는 파일
- 판정 결과가 바뀌면 `packages/sim/src/version.ts` `SIM_VERSION`(서버 config가 같은 값을 내보낸다).
- 프로토콜을 다시 올리면 `packages/protocol/src/version.ts`·`e2e/global-setup.ts` `SETUP_PROTOCOL`.
- N45 칸을 더하면 `packages/sim/src/tuningRecruit.ts`·팩 `tuning.json`·`apps/server/src/tuning/scope.ts`(서버가 읽는 칸).

## 건드리지 말 것
- 올라간 뒤의 `20261103043311_recruit_cards` 마이그레이션.
- 카드 시드 섞기(`recruitCards`의 상수·차례): 바꾸면 이미 산 칸(`recruit_draws`)이 다른 카드를 가리킨다.

## 미검증·TODO·알려진 문제
- 시뮬 전·뒤(시드 1): ADR "바뀜 (D-469 구인 카드)" 7절 표. stub16은 수입이 없어 국고가 마른 뒤(120일) 인구가 줄어 180일 103명(전 1,064) — D-469(인구 = 돈) 그대로의 결과이고 N1은 econ16(Assumed). econ16은 구인이 만족도를 보지 않아 굶는 도시도 다시 채워 반란 이김 103 → 136.
- 시험(Verified, 실행, main `378852d` 합친 뒤 `17ebbea`): `TEST_DATABASE_URL=… pnpm check` 통과(시험 파일 394·시험 3,302, DB 시험 포함 — 새 시험: sim `recruitment.test.ts`·`societyRecruit.test.ts`·`policy.test.ts` 구인 규칙식·`tuningChecks` `n45_fit`, 프로토콜 `recruit.test.ts`, 서버 `recruit/gateway.test.ts`·`recruit.db.test.ts`(NPC 구인 저장·다시 켜기, 유저 고용·거절 코드·잔고 모자람), 게임 `recruitModel.test.ts`), `pnpm check:docs origin/main`, `pnpm check:content origin/main`(4b 호환 포함, core@34), `pnpm --filter @terra/server db:generate` = 변경 없음.
- 첫 화면 JS(Verified, `pnpm build` 뒤 `pnpm check:bundle`): 105,745 B / 상한 131,416 B — 통과(구인 화면은 지연 조각, 미리 캐시 밖 `[Rr]ecruitLab`).
- 화면 시험(Verified, `pnpm e2e recruit.spec.ts units.spec.ts first-login.spec.ts`, 헤드리스 Chromium, 한 작업자): 34 통과·1 건너뜀(legacy). 구인: admin이 가장 싼 카드를 고용 → 성공 알림·"고용함"·잔고 줄어듦, 다른 도시 고르기(?city=), player는 권한 없음·`recruit.board` 200(주인 카드 없음), 390·1440 × 네온·라이트 × 한국어·영어 가로 넘침·작은 누르는 곳 없음. 사진 8장: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/recruit/shots/`(저장소 밖). 390 한국어 주인 카드 표의 상태 칸("남음")이 두 줄로 꺾인다(보기만).
- main `1938e24`의 화면 시험 준비가 깨져 있었다(Verified: 코드 읽기): 보유 물건 판이 최소 프로토콜을 5로 올렸는데 `e2e/global-setup.ts`가 legacy 사이보그를 4판 인사로 만든다 → 인사 거절 → 준비 단계 실패. 이 가지는 준비를 7판으로 바꾸고 legacy 시험(`first-login.spec.ts` 속성 분배 전 사이보그)을 건너뛴다. 분배 전 사이보그를 DB로 차리는 준비는 다음 줄기.
- 행정 건물 레벨은 모든 도시 Lv1 [임시](올리는 길·화면 없음). 유저는 런타임의 어느 도시에서든 고용 [임시]. 유저 휴먼의 수명·만족도·상속은 아직 돌지 않는다.
- NPC 구인 [임시] 손잡이 `npc_recruit_target` 1000‰·`npc_recruit_reserve` 2000‰. Lv4·5 카드 수·토탈 범위 [임시].

## 사용자 결정 대기
- 시작 도시 행정 건물 레벨(옛 시청 = Lv3로 둘지): Lv3면 카드 값 150~190이라 정착 지원금(약 72~108)으로 첫 고용(FTUE ③)을 못 한다.
- 구인 값을 소각(옛 코드)할지 도시 국고로 보낼지.
