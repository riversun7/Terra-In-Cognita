# 2026-11-21 tax-withhold — 임금 소득세 원천징수·가문세 차례·주민세 자리(D-578) + NPC 숙박비 못 낸 일꾼 회복 불이익(빈틈 2293)

- 일시: 2026-11-21 11:30 (KST)
- 작업 도구: Claude Code
- 관련: 사용자 D-578(기획 원문 `docs/design/02_Decision_Log.md` D-578 — 2252 "가" + "사업장에서 일괄 계산 … 임금제공시(유닛에 대한 소득세 납부) … 주민세 … 가문세 가능성도"),
  기획 대조 2293 고침(D-555 1508·1509), ADR "바뀜" 절(`2026-11-15-business-ledger.md`·`2026-11-11-faction-identity.md`·`2026-11-03-labor-contracts.md`),
  새 질문 2321~2327(`docs/questions/2026-11-21-tax-withhold.md`), 답 표시 2252(`2026-11-16-house-8.md`)·2293(`2026-11-16-npc-wage.md`)
- 가지 `work/tax-withhold`, 바탕 a83d59ed91(main, 묶음 1116r)

## 한 일

### A. D-578 세금
1. **임금 소득세 원천징수**. 찾아본 결과(Verified: 검색): 임금 지급은 노동 계약 임금형(`labor_wage` — `@terra/sim settleLabor`, 에스크로 → 유닛 지갑)과 NPC 시설 일꾼 임금
   (`npc/npcWages.ts` → `@terra/sim livingDay`, 시설 금고·국고 → 휴먼 지갑)뿐이다. 직무 배치(제 유닛)는 임금이 없다. **유닛 지갑에서 소득세를 따로 떼는 길은 없었다**
   (개인 세금은 "걷는 자리 없음" — `factionIdentity/houseHome.ts` 주석, 질문 1843).
   - 임금형 계약: `@terra/sim` `LaborAccounts`에 선택 고리 `incomeTax`를 더하고 `wageEntries`가 같은 거래 안에서 **총 임금 → 소득세(국고) → 가문세(소득세 뗀 뒤 임금 기준,
     가문 금고) → 세후 임금(유닛 지갑)** 차례로 줄을 만든다. 보증금·`paidTotal`·에스크로 불변 조건은 총 임금 그대로.
   - 서버 셈(`business/withhold.ts`, 새 모듈): 세율 = 그 사업장 수입 소득세율(도시 나라 거래세 만분율 [임시] — `business_tax`와 같은 율), 받는 곳 = 그 도시 나라 국고, 같은
     주머니(계약 시설 주인 = 그 나라)면 0. **누적 내림**(계약 `paidTotal` 기준 ⌊(앞 + 이번) × 율⌋ − ⌊앞 × 율⌋): 기준 임금 20 × NPC 나라 2% = 0.4라 한 번씩 내리면 늘 0이었다
     (DB 시험 첫 판에서 확인 — 질문 2322). 사업장 장부(`createBusinessCore`)가 원장에 셈을 붙이고(WeakMap, 가문세 표와 같은 꼴), `labor/wagePurse.ts withWageTaxes`(옛
     `withHouseWageTax`)가 원장으로 찾는다 — `labor/service.ts`(995줄)는 이름 두 곳만 바꿨다.
   - 사업장 장부 칸 **"원천징수 소득세"**(`withholding`, `@terra/shared` `BOOK_COLUMNS`): `business/books.ts`가 그 사업장 계약 에스크로가 낸 `labor_wage` 거래의 국고 줄(세력 주체의
     위치 없는 계정, 일꾼 주인 아님)을 기간 합으로 따로 읽는다. 임금 칸(보증금)에 이미 든 돈이라 **이익 밖**. 재무 화면 손익계산서에 임금 아래 덧줄(흐린 글씨, 비용 합에 다시
     더하지 않음 — 문구 ko·en 하나).
   - NPC 시설 일꾼 임금: 시설 주인 = 도시 주인 나라라 늘 같은 주머니 → 원천징수 0(사업장 수익 세금 면제와 같은 규칙, 질문 2326). 코드 바뀜 없음.
   - 사업장 수익 세금(D-555 1503)은 그대로.
   - 설정 칸 `business_wage_withhold_mode`(1 켬·0 옛 판).
2. **가문세 같은 자리**: house-8부터 이미 같은 `labor_wage` 거래에서 떼고 있었다 — 바탕을 소득세 뗀 뒤 임금으로 바꿔 차례를 맞췄다(질문 2321). 배당 쪽·기본 화폐만은 그대로.
3. **주민세 자리**: 설정 칸 `nation_resident_tax_pm`(출발값 0 = 안 걷음, 이름에 "기획 미정")만. 읽는 코드·걷는 코드 없음. 질문 2323에 누가·얼마·언제·못 내면·받는 곳을 빈틈으로.

### B. 빈틈 2293 — NPC 숙박비 못 낸 일꾼
- 플레이어 일꾼 규칙(`labor/workerRest.ts` — 다 못 내면 노숙 회복 [임시])을 NPC에도: 하루 끝 숙박비(`npcWages.chargeLodgingFees`)에서 휴먼 지갑이 모자라 다 못 낸 일꾼(유닛 ID)을
  도시마다 적고, 곧 이어지는 쉼터 계획(`economy.ts syncCity` → `npcWages.restPlan` → `cityRest.ts withUnpaidRest`)에서 그 일꾼 자리의 회복을 노숙으로 쳐 그 시설 생산 속도 배율
  (`dutyPm`)을 다시 센다. 쉼터 자리·침대·오감 칸·숙박비 바퀴는 그대로(플레이어도 회복 배율만 떨어진다). 다음 숙박비를 다 내면 풀린다. 표는 메모리 [임시]. 끈 판
  (`business_npc_wage_mode` 0 — 국고가 냄)은 옛 판 그대로.
- 시뮬은 숙소가 없어(숙박비 0) 해당 없음.

## 시뮬 전·후 (Verified — 실행, `node cli/sim.ts econ16 --seed N --days 30 --summary …`)
바탕 = 같은 작업 트리에서 바꾼 것을 잠시 치운(stash) 코드. 요약 JSON에서 `content`(팩 판·해시)·`linesHash`만 다르고 나머지는 모두 같다.

| 시드 | 판 | 인구 | 도시 | 세력 | 국고 합 | 지갑 합 | 임금 누적 |
|---|---|---|---|---|---|---|---|
| 1 | 바탕 | 2220 | 69 | 45 | 34333 | 0 | 574192 |
| 1 | 이 줄기 | 2220 | 69 | 45 | 34333 | 0 | 574192 |
| 2 | 바탕 | 2520 | 70 | 46 | 55579 | 0 | 566418 |
| 2 | 이 줄기 | 2520 | 70 | 46 | 55579 | 0 | 566418 |
| 3 | 바탕 | 2271 | 69 | 45 | 23682 | 0 | 564854 |
| 3 | 이 줄기 | 2271 | 69 | 45 | 23682 | 0 | 564854 |

- 시뮬은 노동 계약을 돌리지 않고 NPC 임금은 같은 주머니, 숙소가 없다 → 판정이 바뀌지 않는다. 그래서 **SIM_VERSION 그대로(65)**.

## 판·마이그레이션·리셋
- 팩 **core@162**(줄기 판 — 합칠 때 묶음 판으로, 설정 칸 둘). `id-changes.json` 그대로.
- 프로토콜 그대로(장부는 tRPC 응답 — 새 칸 `withholding`은 옛 기기가 모르는 열쇠라 무시한다). SIM_VERSION 그대로, 시뮬 출력 형식 그대로.
- DB 표·마이그레이션 없음.
- **리셋 필요 없음.** 배포 뒤: 남의 나라 도시(NPC 나라 포함)의 플레이어 사업장 임금형 계약은 다음 임금부터 누적 내림으로 소득세가 국고로 간다(유닛 지갑이 그만큼 덜 받는다 —
  2% 나라에서 하루 20이면 두세 날에 1). 옛 계약의 `paidTotal`이 이미 크면 첫 임금의 세금도 바로 0이 아닐 수 있다(누적 차이라 한 번에 최대 ⌈율 × 임금⌉). NPC 일꾼 가운데 임금을 못 받아
  숙박비를 못 낸 일꾼이 있는 도시는 그 시설 생산이 하루 동안 준다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/economy/laborContract.ts`(+ 시험) | `LaborAccounts.incomeTax`, 임금 거래 차례(소득세 → 가문세 → 세후) |
| `packages/sim/src/society/businessCoefficients.ts`·`tuningBusiness.ts`, `content/core/tuning.json`·`manifest.json` | 설정 칸 `business_wage_withhold_mode`·`nation_resident_tax_pm`(자리만), 팩 core@162 |
| `apps/server/src/business/withhold.ts`(새, + 시험) | 원천징수 셈(세율·같은 주머니·누적 내림)·원장에 붙이기 |
| `apps/server/src/business/core.ts` | 사업장 장부가 원천징수 셈을 만들고 원장에 붙임, `BusinessCore.withhold` |
| `apps/server/src/labor/wagePurse.ts`·`service.ts` | `withWageTaxes`(소득세 + 가문세), 이름 바꿈(줄 수 그대로 995) |
| `apps/server/src/business/books.ts`, `packages/shared/src/businessBooks.ts` | 장부 칸 `withholding`(에스크로 임금 거래의 국고 줄, 이익 밖) |
| `apps/server/src/business/business.db.test.ts` | DB 시험: 열흘 임금 뒤 지갑 = 세후, 국고 = 누적 내림 세금, 장부 원천징수 칸 |
| `apps/game/src/map/business/BooksParts.tsx`(+ 새 그리기 시험)·`businessText.ts`, `apps/game/messages/ko.json`·`en.json` | 손익계산서 덧줄, 문구 `books_col_withholding` |
| `apps/server/src/npc/cityRest.ts` | `withUnpaidRest` — 못 낸 일꾼 자리를 노숙 회복으로 생산 속도 배율 다시 셈 |
| `apps/server/src/npc/npcWages.ts`(+ 시험)·`economy.ts`(+2줄, 948) | 못 낸 일꾼 표·`restPlan` 고리, 쉼터 계획에 얹기 |
| ADR 셋 "바뀜", 질문 둘 답 표시, 새 질문 `2026-11-21-tax-withhold.md` | 기록 |

## 함께 바꿔야 하는 파일
- 합칠 때 팩 core@162 → 묶음 판(`manifest.json`·ADR business-ledger·이 기록).
- 임금 지급 길을 새로 만들면(예: 플레이어 직무 배치 임금, NPC가 남의 시설에서 일하는 임금) `business/withhold.ts`의 셈을 같은 거래 안에서 쓴다(유닛 쪽 세금 셈 없음 — D-578).
- 노동 계약 에스크로 코드(`laborEscrowCode`)·`labor_wage` 거래 꼴을 바꾸면 `business/books.ts`의 원천징수 질의를 함께.
- 플레이어 일꾼 숙박비 불이익 규칙(`labor/workerRest.ts`)을 바꾸면 NPC 쪽(`cityRest.ts withUnpaidRest`)도 함께(D-555 1509 "똑같이").

## 건드리지 말 것
- `labor/service.ts` 995줄·`npc/economy.ts` 948줄·`facilities/world.ts` 999줄 — 늘리지 말고 새 모듈로(원천징수 셈은 원장 표로 붙였다).
- 원천징수 줄은 `labor_wage` 거래 안에 있다(새 거래 종류 없음) — 장부 질의가 이 꼴을 본다.

## 검사
- 작업 중(Verified): `@terra/sim` 시험 116파일 995개, 서버 `withhold.test.ts`·`core.test.ts`·`npcWages.test.ts`, 게임 `BooksParts.test.ts`, DB 시험 `business.db.test.ts`(4)·
  `labor.db.test.ts`(7) 통과. 꾸러미 타입 검사 넷(sim·shared·server·game) 통과. `pnpm check:content --no-compat` core@162 통과.
- 끝 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 한 번(Verified): 포맷·린트·타입·경계·크기·다국어(8,492키)·디자인 값(746쌍)·콘텐츠(core@162 d54893de9317)
  통과, 시험 파일 **809/809**, 시험 **5,953/5,953**.

## 미검증·TODO·알려진 문제
- 서버 실제 세계에서 돌려 보지 않았다(미실행): 원천징수 거래·장부 질의(에스크로 → 거래 → 국고 줄 5개 표 잇기)의 운영 DB 부하. 단위·DB 시험만.
- 장부 원천징수 질의는 "세력 주체의 위치 없는 계정이고 일꾼 주인이 아닌 줄"을 국고로 본다 — NPC 세력 유닛이 플레이어 사업장 임금형 계약에 들고 그 세력이 그 도시 나라이면 세금 줄이
  장부에서 빠진다(원장 돈은 맞다, 지금 NPC 유닛은 노동 계약을 맺지 않는다 — Assumed).
- 화면 시험 `building-screen.spec.ts`(빌드한 앱, 헤드리스, 새 DB, 잠금 안 — Verified): 5 통과·2 실패. 실패 둘은 모두 `smallTapTargets`(누르는 곳 38px — "뒤로"·"1일/7일/30일"·
  "재무 보기"·"들어가기"·"닫기")로, 새 main의 `--control-h-sm` 44 → 38px 바뀜 탓이다(이 줄기는 토큰·그 단추를 건드리지 않음). 재무 화면 손익계산서가 보이는 단언·390px 가로 넘침
  없음 단언은 통과했다. 시험 건물(NPC 제 도시 사업장)은 같은 주머니라 원천징수 덧줄이 나오지 않는다 — 덧줄은 그리기 시험(`BooksParts.test.ts`)으로만 본다. 사진(눈으로 봄):
  `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/tw-shots/building-finance-390-pastel-ko.png` 등.
- 계약·구인 화면은 총 임금 그대로(세후 표시 없음 — 질문 2325).
- NPC 못 낸 일꾼 표는 메모리라 서버를 다시 켜면 첫 하루 끝까지 불이익이 없다 [임시](플레이어 일꾼 표도 같다).

## 사용자 결정 대기
- 질문 2321~2327(`docs/questions/2026-11-21-tax-withhold.md`), 주민세 기획(2323).
