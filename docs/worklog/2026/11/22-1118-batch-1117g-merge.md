# 2026-11-22 묶음 1117g 합치기 (가문 연맹 조항 카드·초대/신청·관리인 부상 자율 치료 / NPC 수요 자르기·세운 시작 도시 수·국방 투자 경비대) — 리셋 필요 없음

- 일시: 2026-11-22 11:18~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `22-1030-league-2`·`22-0950-fixes-1117e`, 질문 `docs/questions/2026-11-22-league-2.md`(2641~2645)·`2026-11-22-fixes-1117e.md`(2621),
  ADR `2026-11-21-npc-needs-drives.md` "바뀜 (league-2, D-590)"·"바뀜 (fixes-1117e)", `2026-11-21-governance.md`·`2026-11-07-world-layout.md` "바뀜 (fixes-1117e)",
  기획 D-590(미러 76fd3b6에 있음)·D-591(사용자 결정 2565 나 — 미러에는 아직 없음)

## 한 일
- main 6a6d0cb50e(묶음 1117f 기록) 위에 줄기 둘을 차례로 합쳤다(합치기 커밋 `--no-ff`, 둘 다 바탕 14537f2649).
  1. `work/league-2`(07cdd7ec1f): 연맹 조항 카드(`shared_vision`·`fee_discount`, 표 `house_league_clauses`), 초대·신청 절차(표 `house_league_requests`,
     행동 invite·approve·decline·clause_on·clause_off), 대표가 그냥 나가면 가장 오래 든 가문이 승계, 관리인 일의 부상 자율 치료(`labor/stewardCare.ts`),
     세력 화면 연맹 부분(`HouseLeagueBlock.tsx`, `@terra/shared/houseLeague`). 새 화면 시험 `e2e/house-league.spec.ts`.
  2. `work/fixes-1117e`(d70e4bdbf6): NPC 시설 기대 수익의 산출 값을 그 도시 수요로 자름(2604 나), 세운 시작 도시 수 표 `nation_start_cities`(2612 — 쿠데타로 잃은
     시작 도시를 다시 채우지 않음), 국방 투자로 경비대 수 늘림(D-591 2565 나).
- 충돌과 푼 방법:
  - `apps/server/src/labor/offlineSteward.ts` import 줄: main(1117f)의 `isGuardianUnit`과 league-2의 `stewardCareOf`를 둘 다 둠. 자율 치료는 관리인 계약이 있는
    유닛만 보고(`stewarded`), 수호신은 계약을 맺지 않으므로(같은 파일의 `isGuardianUnit` 거르기) 따로 거르지 않았다(Verified: 코드 읽기).
  - `apps/server/src/db/schema.ts` 다시 내보내기: 연맹 표 다섯(league-2) + `nationStartCities`(fixes-1117e) 합집합.
  - ADR `2026-11-21-npc-needs-drives.md`: 두 줄기의 "바뀜" 절을 차례로(league-2 → fixes-1117e) 둘 다 남김. 질문 `2026-11-22-npc-invest-2.md`: 두 상태 갱신 줄 둘 다.
  - `content/core/manifest.json`·`docs/WORKLOG.md`: 판 다시 매김·목차 다시 만들기로 풂. `content/core/tuning.json`은 저절로 합쳐짐(칸 넷 = 두 줄기 둘씩).
- league-2 ADR 절 머리의 "D-590(… 미러에는 아직 없음)"을 "묶음 1117f 미러에 있음"으로 고쳤다(미러 `02_Decision_Log.md` D-590 원문 = ADR 인용, Verified).

## 판 번호 다시 매김
| 무엇 | main | 줄기 판 | 묶음 판 |
|---|---|---|---|
| 프로토콜 | 65(최소 64) | league-2 115(최소 114) | **66(최소 65)** |
| 팩 core | 144 | league-2 193, fixes-1117e 183 | **145** |
| SIM_VERSION | 74 | fixes-1117e 114 | **75** |

- 프로토콜: `packages/protocol/src/version.ts`(66 절·지원 목록 줄), `league.ts` `HOUSE_LEAGUE_REQUEST_PROTOCOL_VERSION` 66, `league.test.ts`, 게임 앱 `leagueCommands.ts` 머리 주석.
- 팩: `manifest.json` 145. 두 줄기 모두 `id-changes.json`을 바꾸지 않았다 — main의 1117f 기록(unit_kinds `guardian`, since 144)이 그대로 끝이다(Verified: diff).
- SIM: `packages/sim/src/version.ts` 75 절. 합친 트리에서 시뮬 골든·시험 그대로 통과(아래 전체 검사).
- ADR `2026-11-21-npc-needs-drives.md` 판 줄: league-2 절 = 프로토콜 66(최소 65)·core@145(괄호에 줄기 판 115/114·193), fixes-1117e 절 = SIM 75·core@145(괄호에 114·183).
  줄기 작업 기록·질문 파일은 줄기 판 그대로 두었다.

## 마이그레이션
- 새 마이그레이션 둘, 고치지 않고 그대로 합쳤다. main의 `20261122002529_guardian_state`(2110cf87)와 함께 세 형제가 모두 prevIds = 1117e 끝 `7e79264e-c94f-43c1-b1a3-9e2f1ba61755`:
  - `20261122003331_fixes_1117e_nation_start_cities`(스냅숏 `dd3656c0-8f69-4d66-9e59-8428866e0b8b`) — 표 `nation_start_cities` 더하기.
  - `20261122010738_league_requests_clauses`(스냅숏 `a74a580d-0e90-4570-86de-a4d25e13f18a`) — 표 `house_league_clauses`·`house_league_requests` 더하기.
- 적용은 이름만 보므로 차례와 상관없다(AGENTS.md 6장 Drizzle 갈래). `pnpm --filter @terra/server db:generate` = "No schema changes"(Verified) — 충돌 알림 없음.
- 다음 마이그레이션 `prevIds` = 세 끝 모두: **2110cf87-ab35-4e1e-9369-214a912806a9**, **dd3656c0-8f69-4d66-9e59-8428866e0b8b**, **a74a580d-0e90-4570-86de-a4d25e13f18a**.

## 질문 번호
- 2621(fixes-1117e, 2622~2625 비워 둠), 2641~2645(league-2) — main(2632까지)과 겹치지 않아 옮기지 않았다.

## 파일 크기
- 나눈 파일 없음. 가장 큰 것(wc -l): `simulator/society.ts`·`facilities/service.ts`·`app.ts` 999, `secondMapEngine.ts`·`world.ts`·`persist/tables.ts`·`npc/runtime.ts` 998,
  `sim/src/index.ts`·`npc/economy.ts`·`labor/service.ts` 997 — 모두 상한 안(`check:size` 통과).

## 리셋 필요 여부: 필요 없음
- 마이그레이션 둘 다 표 더하기뿐이라 직전 판 앱이 그대로 돈다. `nation_start_cities`는 첫 부팅에 그때 시작 도시 수로 적힌다(줄기 기록 "알려진 문제" — 쿠데타 기본값 꺼짐이라 운영 영향 없을 것, Assumed).
- 프로토콜 66(최소 65): 1117f 기기(65)는 그대로 들어온다. 새 연맹 행동은 66 기기만 보낸다. `join`의 뜻이 "받은 초대가 없으면 신청"으로 바뀌었다(65 기기에도 같은 답 꼴).

## 바꾼 파일과 이유 (합치며 바꾼 것)
| 파일 | 이유 |
|---|---|
| `apps/server/src/labor/offlineSteward.ts`, `apps/server/src/db/schema.ts` | 충돌 풀기(둘 다 남김) |
| `docs/adr/2026-11-21-npc-needs-drives.md`, `docs/questions/2026-11-22-npc-invest-2.md` | 충돌 풀기(두 절·두 줄), 판 줄, D-590 미러 표시 |
| `packages/protocol/src/version.ts`·`league.ts`·`league.test.ts`, `apps/game/src/faction/identity/leagueCommands.ts` | 프로토콜 66(최소 65) |
| `content/core/manifest.json` | 팩 core@145 |
| `packages/sim/src/version.ts` | SIM 75 |
| `docs/worklog/2026/11/22-1118-batch-1117g-merge.md`, `docs/WORKLOG.md` | 이 기록·목차 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 67(최소 66), 팩 146, SIM 76. 다음 마이그레이션 `prevIds` = 위 세 끝.
- 1117f의 TODO 그대로: 이 판이 운영에서 확인된 뒤 `world/persist/load.ts`의 부팅 때 종류 6 → 4 바꾸기와 `LEGACY_UNIT_KIND_GUARDIAN` 읽기를 지운다.

## 건드리지 말 것
- 마이그레이션 `20261122003331_fixes_1117e_nation_start_cities`·`20261122010738_league_requests_clauses`(이제 올라간다 — 고치지 않는다). 갈래는 다시 만들지 않는다.
- `id-changes.json`은 뒤에 더하기만 한다.

## 검사 (Verified)
- 합치고 판을 다시 매긴 뒤 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 첫 판 **통과**: 포맷(3,382파일)·린트·타입·모듈 경계·파일 크기·다국어(8,964키)·
  디자인 값(746쌍)·콘텐츠(core@145 27774c8a3d0d), 시험 파일 **892/892**, 시험 **6,374/6,374**(fixes-1117e가 시험만 고친 `world/nationTiers.db.test.ts` 포함, `@terra/sim` 골든 통과).
- `pnpm check:content`(호환 포함, core@145 27774c8a3d0d, 단계 1·2·4a·4b 기준 6a6d0cb), `pnpm check:docs`, `pnpm docs:index --check`, `pnpm wiki:index --check`(항목 40개),
  `pnpm settings:cells --check`, `db:generate` "No schema changes" 통과.
- `pnpm build` 통과(PWA 258항목), `pnpm check:bundle` 첫 화면 JS **110,802 B** / 상한 131,416 B(1117f 110,757 B에서 +45 B, 파일 7개).
- 화면 시험(빌드한 앱, 한 번에 두 파일, 1.5분): `house-league.spec.ts` **4/4**, `faction.spec.ts` **28/28** — 합 **32/32**. 흔들림·다시 돌림 없음. 결과·사진 폴더는 지웠다.

## 미검증·알려진 문제
- 서버 실제 세계의 NPC 연맹 신청·승인·초대 빈도, 관리인 치료 빈도, 시야 나눔 덮개 비용, NPC 짓기 변화, 경비대 늘어남은 재지 않았다(Unknown — 줄기 기록).
- 요금 할인 뒤 몇 결과는 깎기 전 값을 보일 수 있다(Assumed — league-2 기록). NPC 가문 유닛·시설에는 조항 카드가 닿지 않는다(질문 2643).
- 운영 DB의 마이그레이션은 배포 때 확인.

## 사용자 결정 대기
- 질문 2621(fixes-1117e), 2641~2645(league-2), 그리고 앞 기록의 남은 대기(2631·2632 …). 2601~2604·2611~2614는 이번 fixes-1117e가 기획 답을 옮겼다.
