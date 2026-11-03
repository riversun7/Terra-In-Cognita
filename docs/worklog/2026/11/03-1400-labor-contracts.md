# 노동 계약(임금형·임대형): 규칙 한 벌·보증금 에스크로·서버 표·명령·조회·경제 화면

- 일시: 2026-11-03 09:00 ~ 14:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-03-labor-contracts.md`(제안), 기획 D-479·D-507·49 N48·D-431·D-432·D-097(미러 `80272e5`), 가지 `work/labor`(main `378852d` 합침)

## 한 일
- 옛 프로젝트(AntiGravt01 얕은 복제 `FETCH_HEAD`)의 `salary_engine.js`(보증금·하루 정산·경고·자동 해고·해고 환불), `ContractDistributor.js`(WAGE 사이클 임금·금고 모자라면 일시 중지·산출 100% 건물), `production_routes.js`(계약·해지 권한), `ProductionRepository.js`(금고 채우면 재개), 독점형 칸(`schema.js`)·유예(`StorageUtils.js` `expireGraceStorage`)를 줄 번호와 함께 대조했다(ADR "옛 규칙" 표). 유예 7일은 N48 값(얕은 복제에 그 수를 쓰는 코드 없음, Unknown).
- 판정(`@terra/sim` `economy/laborContract.ts`): 계약 모양·상태(active·paused·grace·ended)·맺기(보증금 에스크로 + 첫 주기 선불)·정산(지급·만료·유예 끝을 시각 차례로, 유닛이 한 일 구간 work·idle·free)·채우기(일시 중지면 바로 재개)·해지(남은 보증금 환불)·임대료 바꾸기·불변 조건 I14. 시스템 계정 규칙에 `labor_deposit`·`labor_wage`·`labor_refund`.
- 소유 주체 정산(`settle/owner.ts`)에 유닛마다 산출 구간(`outputs`)을 더했다: 계약 몫 창고로 나누고 일시 중지는 산출 없음. 구간이 없으면 예전과 같은 거래 하나(시뮬 출력 그대로).
- 서버(`apps/server/src/labor/`): 표 `labor_contracts`·`labor_rents`(마이그레이션 `20261103043050_labor_contracts`, 새 표만), 부팅 읽기, 서비스(정산 고리로 같은 커밋, 명령 넷, 사라짐 처리, 화면 자료), WebSocket 게이트웨이, tRPC `labor.overview`, 불변 조건 I14(DB). 시험 건물(`place_building`)은 놓은 사람의 소유 주체 것.
- 프로토콜: 같은 날 보유 물건이 올린 판 6에 `labor_create`·`labor_terminate`·`labor_top_up`·`labor_set_rent` → `labor_result`를 더했다(판 그대로).
- 팩 `core@34`: 설정 칸 N48 다섯(임금 주기 하루·보증금 30일·경고 7일·임대료 주기 1시간·유예 7일, 모두 옛 규칙·D-479 값), N27 기준 단가·N28 조정 범위에 단위·기술 범위(서버가 이제 읽어 live). 반영 범위 live 8칸 더함.
- 화면: 경제 → 생산 칸 아래 "노동 계약"(잔고·규칙 한 줄·계약 카드·새 계약 폼·내 시설 임대료), 메시지 67개 ko·en.
- main을 두 번 합쳤다(`1938e24` 보유 물건, `378852d` 콘텐츠 켬). 충돌은 모두 "둘 다 넣기"(세션·앱·맥락·라우터·쓰기 표·월드·프로토콜 묶음·지도 메시지 거르기·반영 범위). 마이그레이션은 올리기 전이라 지우고 보유 물건 뒤로 다시 만들었다(`prevIds` = 보유 물건 스냅샷, 뒤 `db:generate` = No schema changes). 팩 판 32 → 33 → 34.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/economy/laborContract.ts`·`.test.ts` | 노동 계약 규칙 한 벌(서버·시뮬 공용), 시험 16개(보증금·자동 해고·경고·일시 중지·채우기·환불·만료·임대료·유예·나눠 정산 같음·I14) |
| `packages/sim/src/settle/owner.ts`·`.test.ts` | 산출 구간(`outputs`·`OutputSegment`), `discarded`(일시 중지로 안 낸 주기, 0이면 칸 없음) |
| `packages/sim/src/simulator/economyRun.ts` | 시스템 계정 규칙: 에스크로에 노동 계약 거래 셋 |
| `packages/sim/src/society/coefficients.ts`·`tuningLabor.ts`·`tuning.ts`·`index.ts` | 계수표 `labor`(OLD_LABOR_RULES), N48 TUNING_KEYS, 내보내기 |
| `content/core/tuning.json`·`manifest.json` | N48 다섯 칸, N27·N28 단위·범위, 판 34 |
| `apps/server/src/db/laborSchema.ts`·`schema.ts`·`drizzle/20261103043050_labor_contracts/` | 표 둘(schema.ts는 1,000줄 상한 때문에 다시 내보내기 한 줄) |
| `apps/server/src/labor/*` | 서비스·읽기/행·게이트웨이·조회·시험(DB 4개·게이트웨이 2개) |
| `apps/server/src/world/settlement.ts` | 산출 나누기 고리(`routeOutputs`) |
| `apps/server/src/world/world.ts` | 부팅 읽기, 서비스 만들기·고리 걸기, 불변 조건에 메모리 I14 |
| `apps/server/src/world/invariants.ts` | DB I14(에스크로 = 보증금, 계약 없는 에스크로 0) |
| `apps/server/src/world/persist/tables.ts` | 쓰기 대기열 표 둘·차례 |
| `apps/server/src/world/secondMap.ts`·`gateway.ts` | 시험 건물 주인 = 놓은 사람, `buildingOwner`·`forEachBuilding` |
| `apps/server/src/session.ts`·`app.ts` | 노동 계약 메시지 넘기기(판 6), 게이트웨이·서비스 잇기 |
| `apps/server/src/trpc/labor.ts`·`router.ts`·`context.ts`·`createContext.ts` | `labor.overview`(맥락 칸은 선택: 시험 맥락은 not_ready) |
| `apps/server/src/tuning/scope.ts` | 반영 범위 live: `labor.*`·`wageRateMilli`·`employerAdjust*` |
| `packages/protocol/src/labor.ts`·`.test.ts`·`messages.ts`·`index.ts`·`version.ts` | 명령 넷·결과, 판 6 설명 |
| `packages/shared/src/labor.ts`·`package.json` | 조회 응답 타입(`@terra/shared/labor`) |
| `apps/game/src/economy/LaborPanel.tsx`·`labor.css`·`laborCommands.ts`·`queries.ts`·`ProductionView.tsx` | 노동 계약 칸, 명령 보내기, 조회 |
| `apps/game/src/map/mapFeed.ts` | `labor_result`는 지도가 버린다 |
| `apps/game/messages/ko.json`·`en.json` | `labor_*` 67개 |
| `e2e/labor.spec.ts` | 화면 시험(admin 임금형·채우기·임대료 → player 임대형 → 해지, 다크·영어 사진) |
| `docs/adr/2026-11-03-labor-contracts.md`, `docs/PLAN.md` 14장 | 결정·확인 대기·UX 빈칸 |

## 함께 바꿔야 하는 파일
- 노동 계약 메시지를 바꾸면 `packages/protocol/src/labor.ts`·`apps/server/src/labor/gateway.ts`·`apps/game/src/economy/laborCommands.ts`·`LaborPanel.tsx`(결과 코드 표)를 같이.
- N48 칸을 더하면 `tuningLabor.ts`·`coefficients.ts`(OLD_LABOR_RULES)·팩 `tuning.json`(판 올림)·서버 `tuning/scope.ts`.
- 계약 표 열을 바꾸면 `laborSchema.ts`·`persist/tables.ts`·`labor/store.ts`(읽기·행)·`invariants.ts` I14.

## 건드리지 말 것
- 올라간 마이그레이션 `20261103043050_labor_contracts`(main에 들어간 뒤로는 고치지 않는다).
- 에스크로 계정 코드 `escrow:labor:<계약 ID>`와 거래 종류 네 이름(DB에 남는다, I14·감사 규칙이 읽는다).

## 미검증·TODO·알려진 문제
- 시뮬레이터는 계약을 쓰지 않는다(NPC 일꾼은 임금이 없고 휴먼 지출이 없다, ADR 7절). econ16 시드 1 180일 앞(main `378852d`)·뒤(이 가지): 본문 줄 1,943줄이 모두 같다(Verified). 다른 것은 머리 줄·요약의 팩 판·해시(core@33 → core@34)뿐, `linesHash` 90f2a6ac → 420930cd, 위반 0, 끝 유닛 474 그대로. 그래서 `SIM_VERSION` 10 그대로다.
- 서버 산출은 S3 시험 광석이다. 임대형 유예는 시설 창고가 없어 보이기만 한다.
- 같은 정산 구간 안에서 임대료가 유지비보다 먼저 나간다(지갑이 바닥일 때만 차이).
- 화면 시험(e2e, `pnpm e2e e2e/labor.spec.ts`): 2개 통과(5.6초·1.2초, Verified). 단, main(`378852d`)의 전역 준비가 legacy 계정 사이보그를 프로토콜 4로 만드는데 보유 물건이 최소 판을 5로 올려서 "no reply"로 멈춘다 → 로컬에서만 그 줄을 건너뛰게 고쳐 돌렸다(커밋하지 않음, 조율자에게 알림). legacy를 쓰는 `first-login.spec.ts`는 main에서 고쳐야 한다.
- 사진: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/labor/shots/`(labor-admin-pastel-ko-390, labor-player-pastel-ko-390, labor-admin-dark-en-390).

## 사용자 결정 대기
- ADR "확인 대기" 1~5: 모자랄 때 해고·중지 나눔, 자동 해고 때 남은 몫 돌려줌, 선불·중간 해지 환불 없음, 손 해지는 유예 없음, 임금 받는 곳 = 휴먼 지갑 전까지 유닛 소유 주체.
- UX 빈칸: 남의 유닛 고용(구인·수락), 시설 이름·종류, 계약 화면 자리, 보증금 경고 알림(처리할 일 종류).
