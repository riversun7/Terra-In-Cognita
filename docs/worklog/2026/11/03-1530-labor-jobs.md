# 노동 계약 2: 손 해지 유예(기획 341)·구인 게시판(남의 유닛을 임금형으로)

- 일시: 2026-11-03 14:40 ~ 16:30, 2026-11-07 09:30 ~ 10:10 (KST, 주간 사용량 한도로 멈췄다가 이어서)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-03-labor-contracts.md` "바뀜 (2026-11-03, 기획 338~342 답·구인 게시판)", 기획 D-479 기획 정리(338~342, 원본 bd5d754 = 미러 `0c8f523`)·D-161·D-432·D-507·49 N48, 앞 작업 기록 `03-1400-labor-contracts.md`, 가지 `work/labor-2`(main `f2dd7b1`, 이어서 `25dab48`(D-513 N53 스위치·N43 편집기·core@36) 합침)

## 한 일
- 옛 프로젝트(AntiGravt01 작업 트리, 앞 ADR과 같은 줄 번호)를 먼저 읽었다: 건물 운영 설정 한 줄의 모집 여부·기본 임금(`production_routes.js:147-206`·`:315-317`·`:336-338`, `schema.js:4345-4370`), 남의 건물에 내 미니언으로 계약(`:326-332`), 해지 권한(`:396-409`), 일꾼 종류 MINION·USER(`schema.js:4393-4395`), 지갑(`ContractDistributor.js:105-114`), 시장 단가 고정(`salary_engine.js:159-163`), 유예 끝 창고 합치기(`StorageUtils.js:286-298`, `ServerBootstrap.js:184-197`). 표는 ADR "바뀜" 2절.
- 341(판정 `@terra/sim` `economy/laborContract.ts`): 임대형은 손 해지(어느 쪽이든)·유닛 사라짐도 유예, 시설이 사라지면 유예 없이 끝(유예 중이면 유예만), 유예는 손으로 일찍 끝내지 않음(`not_open`), 유예 끝에 `leftoversMovedAtMs` 기록. 임금형은 그대로(바로 끝, 보증금 환불).
- 구인 게시(판정 `economy/laborJobs.ts`): 게시(N28 범위·자리·기간 확인), 받기(임금형 `openLabor`, 고용주 = 시설 주인, 자리 채움 → filled), 닫기(거둠·사라짐), 임금 미리 셈.
- 서버: 표 `labor_postings`·열 `labor_contracts.leftovers_moved_at_ms`(마이그레이션 `20261103061305_labor_postings`), 부팅 읽기(열린 게시만), 게시판(`labor/jobBoard.ts`: 시설마다 열린 게시 하나·다시 내면 바꿈·받을 때 양쪽 정산·사라진 시설 게시 닫기·가까운 도시·조정 큰 차례 50개), 서비스 묶기, 보증금 채우기 때 고용주도 먼저 정산, 끝난 계약 화면 보관은 유예 끝부터 7일, `labor.jobs` 조회, WebSocket 세 명령(판 8).
- 프로토콜 8(최소 7): `labor_post_job`·`labor_withdraw_job`·`labor_accept_job`, `labor_result.jobId`, 코드 `job_not_open`·`employer_insufficient_funds`.
- 화면(경제 → 생산 → 노동 계약): 구인 게시판(도시 거르기·보낼 유닛·[받기]), 내 구인([거두기]·구인 내기 폼), 유예 카드 안내·[해지] 없음, 임대형 해지 안내. 메시지 31개 더하고 2개 고침(ko·en).
- 단가: 서버에 도시 노동 시장(일손 수요·공급)이 없어 N27 기준 단가 그대로다(`labor/rules.ts`로 옮김, sim `baseWageRateMilli`는 아직 아무도 부르지 않음).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/economy/laborContract.ts`·`.test.ts` | 341: 손 해지·유닛 사라짐 유예, 유예 손으로 못 끝냄, 시설 사라짐, `leftoversMovedAtMs`. 시험 5개 더하고 1개 고침 |
| `packages/sim/src/economy/laborJobs.ts`·`.test.ts`, `src/index.ts` | 구인 게시 규칙 한 벌, 시험 6개 |
| `apps/server/src/db/laborSchema.ts`·`schema.ts`, `drizzle/20261103061305_labor_postings/` | 표·열·검사(새 표 + null 열이라 직전 판 앱은 모른 채 돈다) |
| `apps/server/src/labor/jobBoard.ts`(새)·`rules.ts`(새)·`service.ts`·`store.ts`·`views.ts`·`gateway.ts` | 게시판, 규칙 값(단가 = N27), 유예·사라짐 처리, 읽기·행, 조회, 명령 |
| `apps/server/src/labor/labor.db.test.ts`·`gateway.test.ts` | DB 시험 4개 더하고 1개 고침(게시·받기·자리·거두기·다시 냄·사라짐·고용주 잔고·복구, 손 해지 유예·유예 끝 기록·시설 사라짐), 게이트웨이 1개 |
| `apps/server/src/world/persist/tables.ts`·`world.ts`·`secondMap.ts` | 쓰기 표·차례, 도시 넘기기·빈 자료, 건물 기준 칸(가까운 도시) |
| `apps/server/src/session.ts`, `trpc/labor.ts` | 판 8 명령 넘기기, `labor.jobs` |
| `packages/protocol/src/labor.ts`·`version.ts`·`index.ts`·`messages.ts`·`labor.test.ts`·`cyborg.test.ts` | 메시지 셋·코드 둘·판 8(최소 7), 시험 |
| `packages/shared/src/labor.ts` | `LaborJobView`·`LaborJobsResponse`·`LABOR_JOBS_LIMIT`, 계약 `leftoversMovedAt`, 개요 `jobs` |
| `apps/game/src/economy/LaborJobs.tsx`(새)·`laborText.ts`(새)·`LaborPanel.tsx`·`labor.css`·`laborCommands.ts`·`queries.ts` | 게시판·내 구인, 공용 문구·미리 셈, 유예 카드, 명령·조회 |
| `apps/game/messages/ko.json`·`en.json` | `labor_*` 31개 더함, `labor_rules`·`labor_error_not_open` 고침 |
| `e2e/labor.spec.ts` | 구인 내기 → 임대 해지(유예) → 구인 받기 → 해지, 390·1440 × 파스텔 한국어·다크 영어 사진 |
| `docs/adr/2026-11-03-labor-contracts.md`, `docs/PLAN.md` 14장 | "바뀜"·확인 대기 A~D, D-479 줄 |

## 함께 바꿔야 하는 파일
- 구인 메시지를 바꾸면 `packages/protocol/src/labor.ts`·`apps/server/src/labor/gateway.ts`·`session.ts`(판 확인)·`apps/game/src/economy/laborCommands.ts`·`laborText.ts`(코드 문구 표).
- 게시 표 열을 바꾸면 `laborSchema.ts`·`persist/tables.ts`·`labor/store.ts`(`jobRow`·읽기).
- 시설에 종류(직무)가 생기면 sim `LABOR_JOB_KINDS`·표 검사 `labor_postings_job`·게시판 `post`의 직무·화면 `JOB_TEXT`.
- 도시 노동 시장이 생기면 `labor/rules.ts`의 `rateMilli`(도시별로)와 게시판 `jobView`.

## 건드리지 말 것
- 올라간 마이그레이션 `20261103043050_labor_contracts`·이번 `20261103061305_labor_postings`(main에 들어간 뒤).
- 에스크로 계정 코드·거래 종류 넷(앞 기록과 같음), 게시 상태 이름 넷(`open`·`filled`·`withdrawn`·`gone`, DB 검사).

## 미검증·TODO·알려진 문제
- 유예의 "남은 물건 옮기기"는 기록만이다: 시설 창고가 없고 임대형 산출은 지금 임차인 주체 창고로 바로 간다. 창고가 생기면 `leftoversMovedAtMs`가 새로 생긴 계약의 물건을 그 시각에 옮긴다.
- 게시판 도시는 부팅 때 읽은 도시 목록이라 NPC가 새로 세운 도시는 다시 켤 때까지 없다. 단가는 도시마다 같다(도시 노동 시장 없음).
- 받는 쪽은 고용주가 보증금을 낼 수 있는지 미리 모른다(받을 때 `employer_insufficient_funds`).
- 시뮬레이터 출력 그대로: 시뮬레이터 모듈은 계약 함수를 부르지 않는다(Verified: 소스 검색 — `laborContract`·`laborJobs`를 가져오는 비시험 파일은 `index.ts`·`tuningLabor.ts`·`society/coefficients.ts`뿐이고 둘은 형식·출발값만). `SIM_VERSION` 12 그대로, 팩 core@35 그대로.

## 검사
- main `25dab48`을 합친 뒤(충돌: `docs/PLAN.md` 14장 한 줄 = main 글 + 이 가지 D-479 문장, `docs/WORKLOG.md` = 다시 만듦. `service.ts`는 main의 N53 생산 스위치와 자동으로 합쳐짐. `db:generate` = No schema changes. 마이그레이션 갈래(이 가지 `20261103061305_labor_postings` ↔ main `20261103162444_content_overrides_gather_tiers`)는 다시 만들지 않고 그대로 합침), 모두 무거운 작업 잠금 아래에서 돌렸다(Verified):
  - `TEST_DATABASE_URL=… pnpm check`: 통과, 시험 파일 409개·시험 3,403개(건너뜀 없음 = DB 시험 포함). 처음 한 번은 `src/paraglide` 생성 파일이 합치기 전 것이라 oxlint `import(namespace)`가 main의 새 메시지 키를 못 찾아 실패 → `paraglide-js compile`로 다시 만든 뒤 통과(코드 문제 아님).
  - 노동 계약 시험: sim `laborContract.test.ts`·`laborJobs.test.ts` 25개, 서버 `labor.db.test.ts` 8개(DB)·`gateway.test.ts` 3개, protocol `labor.test.ts` 5개.
  - `pnpm build && node scripts/check-pwa.mjs && pnpm check:bundle`: 통과, 첫 화면 JS 105,905 B / 상한 131,416 B(노동 칸은 경제 지연 조각 안, 새 지연 조각 없음).
  - `pnpm check:content origin/main`(팩 바꾸지 않음)·`pnpm check:docs origin/main`·`check:i18n`(3,662키)·`check:contrast`·`check:boundaries`·`check:size`: 통과.
  - 화면 시험 `pnpm e2e e2e/labor.spec.ts`: 4개 통과(4.5·2.7·2.1·2.1초, 전체 17.8초). 처음 실행은 admin 시험 화폐(일꾼 40 × 24)가 구인 받힘 보증금 720에 모자라 `employer_insufficient_funds`로 실패 → 시험에서 일꾼을 60으로 늘림(규칙대로 막힌 것을 화면이 알림 문구로 보인 것도 확인).
  - 사진(파스텔·다크 × 한국어·영어 × 390·1440): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/labor2/shots/`의 `labor-admin-pastel-ko-390.png`, `labor-board-pastel-ko-390.png`, `labor-player-pastel-ko-390.png`, `labor-admin-dark-en-390.png`, `labor-player-dark-en-390.png`, `labor-admin-pastel-ko-1440.png`, `labor-player-pastel-ko-1440.png`, `labor-admin-dark-en-1440.png`, `labor-player-dark-en-1440.png`. 가로 넘침 없음(시험이 본다), 1440에서 게시판 거르기 둘이 나란히.

## 사용자 결정 대기
- ADR 확인 대기 A~D: 유닛 사라진 임대형도 유예, 유예는 손으로 일찍 끝내지 않음(임차인 포함), 게시에 자리 수, 보증금은 받을 때 고용주 지갑에서.
- UX 빈칸: 시설·도시 이름, 고용주 지불 능력 표시, 새 게시·받힘·보증금 경고 알림(처리할 일 종류).
