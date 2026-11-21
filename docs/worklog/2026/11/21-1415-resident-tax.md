# 2026-11-21 resident-tax — 주민세 구조(재산 바탕·나라 주기·사는 도시·빚, D-579, 수치 0) + 가문세·소득세 따로(둘 다 총 임금)

- 일시: 2026-11-21 14:15 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-579(질문 2321·2323 답, 고친 판 원본 9fe9190 — 코디네이터 전달, 미러 `docs/design/`에는 아직 없을 수 있다), ADR "바뀜" 절
  (`2026-11-15-business-ledger.md` "바뀜 (D-579 …)"·`2026-11-11-faction-identity.md` "바뀜 (resident-tax …)"·`2026-11-03-labor-contracts.md` "바뀜 (2026-11-21, D-579 …)"),
  답 표시 2321·2323(`docs/questions/2026-11-21-tax-withhold.md`), 새 질문 2371~2375(`docs/questions/2026-11-21-resident-tax.md`)
- 가지 `work/resident-tax`, 바탕 954fe231c4(main, 묶음 1116t)

## 한 일

### A. 가문세·소득세 따로(D-579 2321 "나")
- 임금 한 번(`labor_wage` 거래 하나)에서 소득세(원천징수, 국고)와 가문세(가문 금고)를 **둘 다 총 임금 기준으로 따로** 뗀다(`@terra/sim wageEntries` — `LaborAccounts.wageTax`가
  받는 값 = 총 임금). 예: 총 100, 소득세 2 + 가문세 10 → 지갑 88. 둘의 합이 총 임금을 넘으면 가문세를 소득세 뒤 남은 만큼으로 줄인다(돈이 생기지 않게).
- 서버 `labor/wagePurse.ts withWageTaxes`는 그대로(받은 값을 넘긴다) — 주석만. 소득세 셈(`business/withhold.ts`)은 그대로(D-579 "소득세는 그대로").
- 배당 쪽 가문세는 원천징수가 없어 바뀜 없음. 가문세에 [임시] 표시는 없었다(넣지 않음).
- 설정 칸 `business_wage_withhold_mode` 설명의 "(가문세는 소득세를 뗀 뒤 임금에서)"를 고쳤다(값 그대로).

### B. 주민세 구조(D-579 2323, 세율 0 = 안 걷음)
1. **임금 원천징수 줄에서 주민세 자리 빼기**: 처음부터 걷는 코드가 없었다(Verified: 검색 — 설정 칸 `nation_resident_tax_pm` 하나, 읽는 코드 없음). 설정 칸 설명·이름을 재산 세금으로
   고쳤다. 임금 줄에 주민세 자리는 없다.
2. **규칙**(`packages/sim/src/society/residentTax.ts`, 새): 과세 단위 = (그 나라 도시에 사는 유닛이 있는 주인, 도시), 같은 주머니(주인 = 그 나라) 뺌. 한 주기 몫 = ⌊재산 × 세율‰ ÷ 1000⌋.
   거래 하나(`resident_tax`)로 주인 지갑 → 그 나라 국고. 못 낸 몫은 **빚**(시스템 계정 `debt:resident:<나라>:<도시>:<주인>:<화폐>` 음수 + 짝 `claim:resident:<나라>:<화폐>`, 돈은 옮기지
   않음), 다음 주기에 지난 빚부터 갚는다(그 도시를 떠나도 이어 감). 결과 = 도시마다 낸 합·도시 몫·국세 몫, 빚 목록.
3. **하루 끝**(`simulator/societyPayouts.ts collectResidentTax`, `society.ts` 한 줄 — 점령 세금 뒤·배당 정산 바로 전): 나라마다 주기 날에만 걷고, 국세 몫을 뺀 도시 몫을 그 도시 세금
   수입으로 다음 **도시 세금 정산(D-304)**의 기간 세금에 더한다(지금 그 나라 도시일 때만 — 질문 2375). 빚이 남으면 고리 `residentTaxArrears`(신용 깎기 자리 — 붙은 것 없음, TODO 빈틈 2374).
   설정 칸 0이고 나라 값 고리(`residentTaxOf`, 정부 세금 화면 줄기 TODO)도 없으면 **바로 돌아간다**(유닛·시설 훑기·계정 만들기 없음).
4. **재산 값**(고리 `SimHooks.residentProperty`): 시뮬은 재산 층이 없어 주지 않는다(걷지 않는다). 서버(`npc/residentProperty.ts`, 새)는 그 도시에 선 그 주인 시설의 **사업장 금고 잔고**
   (그 나라 국고 화폐, `business.vaultBalance` — 랭킹 자산 셈과 같은 바탕)를 도시 시설 목록을 도시마다 한 번 읽어 센다. 건물 자체 값·주거는 값 매기기가 없어 0 [임시, 질문 2371].
   `npc/rulingVault.ts npcRulingHooks`에서 얹는다(`runtime.ts` 995줄이라 늘리지 않음).
5. 설정 칸(팩): `nation_resident_tax_pm`(0, 이름·설명 고침)·`nation_resident_tax_every_ms`(7일, 새)·`nation_resident_tax_nation_pm`(0, 새). 감사 표(`economyRun.ts systemRule`)에 `debt`·`claim` 앞머리.
6. `packages/sim/src/index.ts`: dividends 내보내기 묶음을 `export *`로 바꾸고 residentTax를 더했다(999 → 991줄).

## 시뮬 전·후 (Verified — 실행, `node cli/sim.ts econ16 --seed N --days 30 --out … --summary …`)
바탕 = 같은 작업 트리에서 `packages/sim`·`content`만 954fe231c4로 되돌린 코드. 줄 수 같음(853·895줄), 다른 칸은 머리·요약의 `content`(팩 판·해시)와 `linesHash`뿐.

| 시드 | 판 | jsonl md5 | `content`·`linesHash` 뺀 md5 |
|---|---|---|---|
| 1 | 바탕 | 37164d4cde75e9c15bb11c50a431813f | 7658b14a7344a64167ad9dc4f3e33dd6 |
| 1 | 이 줄기 | 665b4e146cc19238a5e77f8b00d276bf | 7658b14a7344a64167ad9dc4f3e33dd6 |
| 2 | 바탕 | e9aafa19160c5f4d203e78701b6a4937 | 133d3a0e1568357348b54a1338294284 |
| 2 | 이 줄기 | ec37213f257238ef8e762d4423abfb6a | 133d3a0e1568357348b54a1338294284 |

- 시뮬은 노동 계약을 돌리지 않고(가문세 차례 바뀜이 닿지 않음) 주민세 세율 0·재산 고리 없음 → 판정 그대로. **SIM_VERSION 그대로(66)**.

## 판·마이그레이션·리셋
- 팩 **core@130**(줄기 판 — 합칠 때 묶음 판으로). `id-changes.json` 그대로(지운·바꾼 ID 없음).
- SIM_VERSION 그대로(66), 시뮬 출력 형식 그대로(23). 프로토콜 그대로. DB 표·마이그레이션 없음(빚은 원장 시스템 계정).
- **리셋 필요 없음.** 배포 뒤 바뀌는 것: 가문원 유닛의 임금형 계약 임금에서 가문세가 소득세 뒤 임금이 아니라 총 임금 기준으로 커진다(가문세율 × 소득세만큼 — 2% 나라·가문세 10%면
  임금 100마다 0.2). 주민세는 세율 0이라 걷지 않는다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/economy/laborContract.ts`(+ 시험) | 가문세 = 총 임금 기준, 합이 넘으면 가문세 줄임 |
| `packages/sim/src/society/residentTax.ts`(새, + 시험) | 주민세 규칙(과세 단위·세금·국고·빚·도시/국세 몫) |
| `packages/sim/src/simulator/societyPayouts.ts`·`society.ts`(+1줄, 889)·`npcRun.ts`(고리 셋)·`economyRun.ts`(감사 표) | 하루 끝 주민세, 도시 몫 → D-304 기간 세금 |
| `packages/sim/src/simulator/society.test.ts` | 세율 0이면 고리도 안 부름, 주기·배당·빚 시험 |
| `packages/sim/src/society/businessCoefficients.ts`·`tuningBusiness.ts`, `content/core/tuning.json`·`manifest.json` | 설정 칸 셋(둘 새), 원천징수 설명, core@130 |
| `packages/sim/src/index.ts` | `export *` dividends·residentTax(줄 수 줄임) |
| `apps/server/src/npc/residentProperty.ts`(새, + 시험)·`rulingVault.ts` | 서버 재산 값 고리(사업장 금고), 고리 얹기 |
| `apps/server/src/labor/wagePurse.ts` | 주석(가문세 = 총 임금) |
| ADR 셋 "바뀜", 질문 답 표시, 새 질문 `2026-11-21-resident-tax.md` | 기록 |

## 함께 바꿔야 하는 파일
- 합칠 때 팩 core@130 → 묶음 판(`manifest.json`·ADR business-ledger "바뀜 (D-579 …)"·이 기록).
- 정부 세금 화면 줄기(질문 2322 나·2373): 나라 값을 `SimHooks.residentTaxOf`로 준다(서버 고리 — `npc/rulingVault.ts`나 새 모듈에서 얹는다).
- 신용 체계(빈틈 2374)를 만들면 `SimHooks.residentTaxArrears`를 붙이고 빚 계정(`debt:resident:…`)을 신용 셈에 읽는다.
- 건물 값 규칙(질문 2371)이 생기면 `npc/residentProperty.ts`만 바꾼다(규칙은 값만 받는다).
- 플레이어 유닛의 "사는 도시"를 만들면 그 유닛이 `world.units`(사회 규칙 세계)에 들어오는지 확인 — 지금 과세 단위는 그 표에서 만든다(질문 2372).

## 건드리지 말 것
- `packages/sim/src/index.ts`(991)·`npc/runtime.ts`(995)·`facilities/world.ts`(999)·`app.ts`(999) — 늘리지 말고 새 모듈로.
- 주민세 세율 0이면 `collectResidentTax`가 고리를 부르기 전에 돌아가야 한다(시뮬 출력 바이트 같음 — 시험 "세율 0(출발값)이면 재산 값을 묻지도 않고").

## 검사
- 작업 중(Verified): `@terra/sim` 시험 118파일 1,006개, 타입 검사. 서버 `residentProperty.test.ts`·`withhold.test.ts`·`rulingVault.test.ts`·`houseTax.test.ts`, 서버 타입 검사.
  `pnpm settings:cells --check`, `pnpm check:content --no-compat`(core@130) 통과.
- 끝 전체 `pnpm check`(TEST_DATABASE_URL): 아래 "끝 검사"에 적는다.

## 미검증·TODO·알려진 문제
- 서버 실제 세계에서 세율을 올려 돌려 보지 않았다(미실행). 지금 서버 세계에서 사는 도시가 있는 유닛은 NPC 휴먼·가문 마을 휴먼뿐이고 거의 모두 같은 주머니(주인 = 도시 나라)라, 세율을 올려도
  걷히는 곳이 거의 없을 것이다(Assumed — 질문 2372).
- 서버 DB 쓰기: 빚 계정·주민세 거래는 다른 원장 거래와 같은 길로 저장된다(Assumed — 원장 고리 그대로, DB 시험 없음).
- TODO(빈틈 2374): 신용 점수 체계 없음 — 빚 기록·고리만.
- TODO(2373): 나라마다 세율·주기 저장·화면 없음 — 설정 칸 하나를 모든 나라에.

## 사용자 결정 대기
- 질문 2371~2375(`docs/questions/2026-11-21-resident-tax.md`), 빈틈 2374(신용 체계).
