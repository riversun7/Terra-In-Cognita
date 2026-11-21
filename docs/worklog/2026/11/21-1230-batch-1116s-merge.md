# 2026-11-21 묶음 1116s 합치기 (임금 소득세 원천징수) — 리셋 필요 없음

- 일시: 2026-11-21 12:30~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `21-1130-tax-withhold`, 질문 2321~2327(`docs/questions/2026-11-21-tax-withhold.md`), ADR "바뀜" 절
  (`2026-11-03-labor-contracts.md`·`2026-11-11-faction-identity.md`·`2026-11-15-business-ledger.md`)

## 한 일
- main a83d59e(묶음 1116r) 위에 `work/tax-withhold`(d2c77b4, 바탕 a83d59e)를 `--no-ff`로 합쳤다. 합치는 동안 origin/main은 움직이지 않았다.
  - 임금 소득세 원천징수(기획 D-578): 임금형 계약 임금을 줄 때 사업장이 소득세(총 임금 × 그 사업장 도시 나라 소득세율)를 같은 거래에서 국고로 내고 유닛은 세후 임금을 받는다
    (sim `laborContract.ts` `LaborAccounts.incomeTax`·`wageEntries`, 서버 `business/withhold.ts`, `labor/wagePurse.ts` `withWageTaxes`). 가문세 바탕 = 소득세를 뗀 임금.
    사업장 주인이 그 나라 자신이면 떼지 않는다.
  - 장부 칸 `withholding`(`business/books.ts`, `@terra/shared` `businessBooks.ts`), 손익계산서 덧줄(게임 `BooksParts.tsx` `books-withholding`, 비용 합에 다시 더하지 않음).
  - 설정 칸 `business_wage_withhold_mode`(1 켬)·`nation_resident_tax_pm`(주민세 자리, 0 — 읽는 코드 없음).
  - NPC 숙박비 못 낸 일꾼 회복 불이익(`npc/npcWages.ts` `restPlan`, `npc/cityRest.ts` `withUnpaidRest`, 빈틈 2293).
- **충돌 없음** — 자동으로 합쳐졌다(`content/core/manifest.json`·`docs/WORKLOG.md`도 한쪽만 바뀜). 손으로 푼 코드 충돌이 없다.
- 최종 판:
  - 프로토콜 **55**(최소 **54**) 그대로.
  - 팩 **core@128**(줄기 판 162 → 128 — 설정 칸 둘). `id-changes.json` 그대로(새 줄 없음). `tuning.json`은 이 줄기만 바꿨다(3방향 = 한쪽만, 칸 ID 겹침 없음 — 같은 ID 두 번
    없는 것 확인). ADR business-ledger의 판 줄을 128로(줄기 판 괄호). 줄기 작업 기록의 "core@162"는 줄기 기록이라 그대로 둔다.
  - `SIM_VERSION` **65** 그대로 — sim 바뀜은 서버만 쓰는 선택 고리(`incomeTax`)·설정 칸 읽기라 시뮬 결과가 같다(줄기가 econ16 시드 3개로 확인). 합친 판에서 `@terra/sim` 시험
    116파일·995개 통과(골든 포함, Verified).
  - 시뮬 출력 형식 22 그대로. 마이그레이션 없음 — 다음 마이그레이션 `prevIds` = 41cf0481·ae46b32c·269797c2 그대로.
- `docs/worklog/2026/11/21-1000-batch-1116r-merge.md` 끝에 "## 배포 (Verified)" 절(1116r CI 370·NAS 배포·nas-metrics, 조정 담당이 보낸 값)을 넣었다.

## 리셋 필요 여부: 필요 없음
- 프로토콜·DB 표·마이그레이션 바뀜 없음. 팩은 설정 칸 더하기. 장부 응답의 새 칸 `withholding`은 옛 기기가 모르는 열쇠라 무시한다.
- 배포 뒤 운영 세계에서 바로 느껴질 바뀜:
  - **임금형 계약 일꾼**: 다음 임금 주기부터 받는 임금이 소득세만큼 준다(그 도시 나라 소득세율, 사업장 수입 소득세와 같은 율). 그 몫은 그 나라 국고로 들어간다 — 원장 돈은
    사업장 에스크로에서 나가는 양이 그대로라 사업장 금고 쪽은 바뀌지 않는다. 가문세는 소득세를 뗀 뒤 임금에서 떼므로 가문 금고 수입이 조금 준다.
  - **재무 화면**: 원천징수가 있는 사업장의 손익계산서에 "원천징수 소득세" 덧줄(흐린 글씨)이 생긴다. NPC 제 도시 사업장은 같은 주머니라 덧줄이 없다.
  - **NPC 일꾼**: 숙박비를 못 낸 NPC 일꾼은 다음 쉬기에서 회복이 덜 된다(첫 하루 끝까지는 메모리 표가 비어 불이익 없음 [임시]).
  - 주민세는 자리만(0) — 바뀜 없음.

## 손으로 푼 곳
- `content/core/manifest.json`: 162 → **128**.
- `docs/adr/2026-11-15-business-ledger.md` 412줄: 판 줄 "core@128(묶음 1116s, 줄기 판 162 — 설정 칸 둘)".
- `docs/WORKLOG.md`: 이 기록을 더한 뒤 `pnpm docs:index`.
- 파일 크기: 넘은 파일 없음. 큰 파일: `npc/economy.ts` 948(줄기 기록 "늘리지 말고 새 모듈로" 그대로).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json` | 팩 판 core@128 |
| `docs/adr/2026-11-15-business-ledger.md` | 판 번호 설명 128(줄기 판 괄호) |
| `docs/worklog/2026/11/21-1000-batch-1116r-merge.md` | 1116r 배포 결과 절 |
| `docs/worklog/2026/11/21-1230-batch-1116s-merge.md`, `docs/WORKLOG.md` | 이 기록·목차 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 56, 팩 129, SIM 66, 시뮬 출력 형식 23. 다음 마이그레이션 `prevIds` = 41cf0481·ae46b32c·269797c2.
- 앞 묶음(1116r)의 "함께 바꿔야 하는 파일" 그대로: 거래소를 읽기만 할 때는 `peekMarket`, 국가 지도자 지갑은 npc-wage 지갑 옮기기·상속 밖, **다음 배포에서 옛 `exchange_lockers`
  표를 지운다**(1116n TODO).
- 줄기 기록의 "함께 바꿔야 하는 파일"을 그대로 따른다(장부 원천징수 질의의 국고 판정, 계약·구인 화면 세후 표시 2325).

## 건드리지 말 것
- 설정 칸 ID `business_wage_withhold_mode`·`nation_resident_tax_pm`.
- `withWageTaxes` 차례(총 임금 → 소득세 → 가문세 → 세후 임금) — 기획 D-578·질문 2321.
- 줄기 기록의 "건드리지 말 것".

## 검사 (Verified)
- 손으로 푼 코드 충돌이 없어 합친 뒤 전체 `pnpm check`를 따로 돌리지 않았다(AGENTS.md 3장). 줄기가 끝에 같은 바탕(a83d59e) 위에서 전체 `pnpm check`(DB 시험 포함)를 통과했다.
  푸시 전 훅의 `pnpm check` 결과는 아래 "푸시" 절.
- `pnpm check:content a83d59e`: core@128 (c8ca22f0ba8e) 단계 1·2·4a·4b 통과.
- `pnpm check:docs a83d59e`: 통과. `pnpm settings:cells --check` 최신.
- `@terra/sim` 시험(`vitest run`): 116파일·995개 통과(판정·골든 그대로 → SIM 65 유지).
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,517 B / 상한 131,416 B(1116r 110,505 B, +12 B).
- 화면 시험 `building-screen.spec.ts`(빌드한 앱, 헤드리스, 새 DB, 잠금 안 — 시험 DB가 꺼져 있어 `startpg.sh`로 다시 켠 뒤): **5 통과·2 실패.** 실패 둘은 모두 `smallTapTargets`
  (누르는 곳 38px — "뒤로"·"1일/7일/30일"·"재무 보기"·"들어가기"·"닫기")로 새 main의 `--control-h-sm` 44 → 38px 바뀜 탓이다(1116r 기록 "알림"과 같음, 이 묶음은 토큰·그 단추를
  건드리지 않음). 두 시험 모두 그 앞의 재무 화면 내용 단언(장부 칸·기간 30일 누름·지분·일꾼 칸 카드)과 390px 가로 넘침 없음 단언은 통과했다. 사진 시험 넷(390 파스텔 한국어·다크 영어,
  재무 화면·[관리] 지급준비금)은 통과. 원천징수 덧줄은 시험 건물(NPC 제 도시 사업장)에 나오지 않아 그리기 시험(`BooksParts.test.ts`)으로만 본다. 사진(눈으로 봄 — 재무 화면 손익계산서,
  넘침 없음): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/1116s-shots/`.

## 미검증·TODO·알려진 문제
- 줄기 TODO는 줄기 기록에 있다: 원천징수 거래·장부 질의의 운영 DB 부하(서버 실제 세계 미실행), 장부 국고 판정의 NPC 세력 유닛 틈(Assumed), 계약·구인 화면 총 임금 그대로(2325),
  NPC 못 낸 일꾼 표가 메모리 [임시].
- 시뮬(econ16 등)은 합친 판에서 다시 돌리지 않았다 — 줄기가 같은 바탕에서 econ16 시드 3개로 결과가 같음을 확인했고 합치기에서 sim 코드는 바뀌지 않았다.
- 새 main 토큰 바뀜으로 작은 누르는 곳 단언이 있는 화면 시험이 main에서 실패 상태다(1116r부터, 사용자 결정 대기).

## 사용자 결정 대기
- 질문 2321~2327(임금 소득세 원천징수), 앞 묶음의 2311~2317·2301~2306·2291~2295·2251~2259·2261~2270·2271~2278·2281~2285, 1116o의 2231~2244, 1116n의 2201~2207·
  2211~2215·2221~2224. 화면 누르는 곳 38px(토큰 되돌리기 또는 시험 문턱 고치기).
