# 2026-11-17 npc-wage — NPC 휴먼 일꾼 임금·생필품 값·숙박비를 휴먼 지갑으로 (빈틈 2236)

- 일시: 2026-11-17 00:40 (KST)
- 작업 도구: Claude Code
- 관련: 빈틈 2236(질문 `docs/questions/2026-11-16-npc-econ-6.md` — 기획 대조 D-569 1782·D-097·D-555 1507·1509), 일정 제안(작업 기록 `16-2210-fixes-1116o.md`),
  ADR "바뀜" 절(`2026-10-31-economy-core.md` "바뀜 (2026-11-16, NPC 휴먼 지갑·임금·생활비)"·`2026-11-15-business-ledger.md` "바뀜 (질문 2236)"), 새 질문 2291~2295
  (`docs/questions/2026-11-16-npc-wage.md`)
- 가지 `work/npc-wage`, 바탕 0efec8a4a7(main, 묶음 1116p)

## 한 일
- **시뮬 휴먼 지갑**(`packages/sim/src/simulator/humanPurse.ts`, 새 모듈): 지갑 = 서버 유닛 지갑과 같은 원장 계정 (유닛 주인, 화폐, `unitPurseLocation(유닛 ID)`).
  하루 끝(도시 경제 `endOfDay`, 중앙은행 전) 도시마다 휴먼 차례(경비대 아닌 휴먼 유닛 ID 차례 → 경비대)로
  ① 일꾼(서버 `npc/humanPlaces.ts`와 같은 나눔 — `cityWorkerUnits`)은 하루 임금 = 기준 임금(플레이어 직무 배치와 같은 식 `npcBaseDailyWage`, 출발값 20) × 그날 포만감
  효율(N33 — 그날 받은 생필품 경계 몫, 굶으면 0) × 설정 칸 `business_npc_wage_pm`(1000) ÷ 1000을 국고(서버 고리면 시설 금고) → 지갑. 낼 곳이 모자라면 못 받는다.
  ② 모든 휴먼이 그날 먹은 생필품 값(그 도시 마지막 체결가, 없으면 팩 시작 시세)을 지갑 → 도시 주인 국고(다음 숙박비 몫은 남김). 모자란 몫은 주인 현물 부양(굶기지 않는다).
  도시마다 원장 거래 하나(`npc_living`, 같은 계정은 합쳐 0이 아닌 것만). 생필품 받는 차례를 적기 위해 `onUpkeep`이 경계마다 받은 수를 `today.served`에 남긴다.
- 지갑 옮기기·상속: 도시 주인 바뀜(`beforeCityTransfer` — 그 도시 휴먼 지갑 위치도 창고와 함께), 새 마을(`SimHooks.unitsOwnerChanged` → `movePurses`), 떠나는
  휴먼(사망·신격화 — `society/population.ts inheritPurse`, 사망 상속과 같은 규칙. 옛 `WALLET_BASE` 상속은 그대로). 세력이 사라지면 `transferHoldings`가 이미 모두 옮긴다.
- 하루 줄 `econ`·요약 `economy`에 `living` 칸(받은·못 받은·굶은 일꾼 수, 화폐마다 임금·지갑에서 낸 생필품 값·현물 부양, 지갑 합·국고 합) — 출력 형식 22.
- 설정 칸 둘(`business_npc_wage_mode` 1 — 0이면 옛 판, `business_npc_wage_pm` 1000)을 사업장 계수표·팩 tuning에.
- **서버**(`apps/server/src/npc/npcWages.ts`, 새 모듈): 시뮬과 같은 `runEconomy`에 임금·생활비 선택을 넘기고 두 고리를 붙인다 — 임금 낼 곳 = 건물 시설이면 그 사업장 금고
  (모자라면 NPC 주인이 국고에서 `invest`), 도시 직무·장부 없음은 국고. 숙박비(예전 `npc/economy.ts chargeLodgingFees` — 지우고 옮김)는 일꾼 휴먼 지갑에서 숙소
  사업장 금고로(숙소마다 거래 하나 + `taxIncome`), 지갑이 모자라면 있는 만큼만(국고가 대신 내지 않음, 다 못 낸 수 = 기록 `npcLodgingFees.short`). 끈 판은 예전처럼 국고.
- 화면: 바꾸지 않았다. 내 유닛 지갑은 이미 유닛 화면 "화물" 칸에 화폐 줄로 보인다(지갑 = 화물 위치의 화폐). NPC 휴먼은 상세 판이 없다(질문 2294).

## 시뮬 전·후 (Verified — 실행, 30일, `node cli/sim.ts <시나리오> --seed N --days 30`)
"끈 판" = 이 판에 `--tuning`으로 `business_npc_wage_mode` 0. 시드 1은 바탕(main) 코드 실행과 인구 2,202·사건 1,064,388건이 같았다(옛 판과 같은 판정 확인). "10배" =
`business_npc_wage_pm` 10000(임금 200 > 하루 생필품 값 136 — 지갑에 쌓이는 경우를 보려는 시험).

econ16:

| 시드 | 판 | 인구 | 도시 | 세력 | 건물 | 만족도 | 국고 합 | 지갑 합 | 임금 누적 | 지갑→국고 생필품 | 못 받은 일꾼(누적) | 굶어 임금 0(누적) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 끈 판 | 2202 | 69 | 45 | 1161 | 52 | 44681 | 0 | 0 | 0 | 0 | 0 |
| 1 | 기본 | 2202 | 69 | 45 | 1161 | 52 | 44681 | 0 | 560408 | 560408 | 370 | 22487 |
| 1 | 10배 | 1882 | 69 | 45 | 1112 | 54 | 22386 | 184488 | 2031960 | 1798072 | 15748 | 21224 |
| 2 | 끈 판 | 2316 | 70 | 48 | 1129 | 50 | 53610 | 0 | 0 | 0 | 0 | 0 |
| 2 | 기본 | 2316 | 70 | 48 | 1129 | 50 | 53610 | 0 | 553064 | 553064 | 764 | 30223 |
| 2 | 10배 | 1905 | 70 | 46 | 1064 | 56 | 33885 | 170352 | 1874260 | 1678330 | 17179 | 21712 |
| 3 | 끈 판 | 2199 | 69 | 45 | 1196 | 54 | 20686 | 0 | 0 | 0 | 0 | 0 |
| 3 | 기본 | 2199 | 69 | 45 | 1196 | 54 | 20686 | 0 | 527634 | 527634 | 1665 | 24134 |
| 3 | 10배 | 1669 | 69 | 45 | 986 | 56 | 10609 | 144420 | 1786800 | 1611992 | 15393 | 21123 |

- 기본값: 일꾼 임금(20)이 하루 생필품 값(136)보다 작아 그날 모두 국고로 돌아온다 → 지갑 합 0, 인구·도시·세력·건물·만족도·국고가 끈 판과 **같다**(판정 그대로, 원장 거래만 는다).
  "못 받은 일꾼"은 그 순간 국고가 임금보다 적었던 경우(370~1,665명·일), "굶어 임금 0"은 그날 생필품을 30% 넘게 못 받은 일꾼(N33).
- 10배: 지갑이 저축을 들고 쓸 곳이 없어(숙박비·생필품뿐) 30일 뒤 지갑 합 14만~18만, 국고 합이 절반, 못 받은 일꾼이 늘고 구인이 줄어 인구 15~24%·건물 4~18% 감소.
  → 돈이 지갑에 쌓이기만 하고 국고가 마르는 위험이 이것이다. 그래서 기본값은 생활비보다 작은 기준 임금(질문 2291).
- war16은 경제 칸이 없는 시나리오라 이 판이 닿지 않는다(시드 1 끈 판·기본 해시 a062384d 같음 — 다른 시드는 재지 않음).
- build16은 `id` 말고 econ16과 같은 시나리오 파일이라 시드 1·2 결과가 econ16과 같았다(인구·사건 수 같음 — 따로 적지 않는다).

## 판·마이그레이션·리셋
- SIM_VERSION **90**(줄기 판 — 합칠 때 main 다음 판 63으로), 팩 **core@150**(줄기 판 — 합칠 때 main 다음 판으로, 설정 칸 둘), 시뮬 출력 형식 **22**(합칠 때 다른 줄기와 겹치면 다음 수).
  프로토콜 그대로. `id-changes.json` 그대로(지운 ID 없음).
- DB 표·마이그레이션 없음(지갑은 이미 있는 원장 계정 꼴 — 위치 = −유닛 ID).
- **리셋 필요 없음.** 운영 세계 이행: 지금 NPC 휴먼 지갑은 0이지만 첫 하루 끝에 임금이 먼저 들어오고(임금 → 생필품 값 → 숙박비 차례) 그 안에서 낸다 — 시작 돈을 넣지 않았다
  (국고에서 옮기거나 새로 찍지 않음). 금고·국고가 비어 임금을 못 받은 일꾼은 숙박비도 못 낸다(예전에도 국고가 비면 못 냈다 — 지금은 회복 불이익 없이 기록만, 질문 2293).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/simulator/humanPurse.ts`(새)·`humanPurse.test.ts`(새) | 휴먼 지갑·일꾼 나눔·하루 끝 임금·생필품 값·지갑 옮기기 |
| `packages/sim/src/simulator/economy.ts` | `today.served`, `onUpkeep` 받은 수 적기, 도시 주인 바뀜 때 지갑도 옮김 |
| `packages/sim/src/simulator/economyRun.ts` | `runEconomy`·`attachEconomy` 선택 `living`, 하루 끝 `livingDay`, `living` 칸, 고리 `moneyAssets`·`unitsOwnerChanged` |
| `packages/sim/src/simulator/npcRun.ts` | `SimHooks` 고리 둘 |
| `packages/sim/src/simulator/society.ts`, `society/population.ts` | 새 마을 지갑 옮기기, 떠나는 휴먼 지갑 상속(`inheritPurse`) |
| `packages/sim/src/simulator/run.ts` | 규칙 넘기기, 출력 형식 22 |
| `packages/sim/src/simulator/serverEconomy.ts` | 서버가 쓰는 내보내기 |
| `packages/sim/src/society/businessCoefficients.ts`, `tuningBusiness.ts`, `content/core/tuning.json`·`manifest.json` | 설정 칸 둘, 팩 core@150 |
| `packages/sim/src/version.ts` | SIM 90 |
| `apps/server/src/npc/npcWages.ts`(새)·`npcWages.test.ts`(새) | 임금 낼 곳(시설 금고)·숙박비를 지갑에서 |
| `apps/server/src/npc/economy.ts` | `chargeLodgingFees`를 새 모듈로 옮김(980 → 942줄), `runEconomy`에 선택, 사업장 장부 타입에 `vault`·`taxIncome` |
| ADR 둘 "바뀜", 질문 `npc-econ-6`(2236 고침 표시), 새 질문 `2026-11-16-npc-wage.md` | 기록 |

## 함께 바꿔야 하는 파일
- 합칠 때: SIM 90 → main 다음 판(`version.ts`·ADR 둘·질문·이 기록의 판 설명), 팩 core@150 → main 다음 판(`manifest.json`·ADR·이 기록), 출력 형식 22(다른 줄기와 겹치면).
- 일꾼 나눔을 바꾸면 `npc/humanPlaces.ts`와 `@terra/sim cityWorkerUnits`를 함께(보이는 일꾼 = 임금 받는 일꾼).
- 기준 임금 식을 바꾸면 서버 `labor/rules.ts wageRulesOf`와 `npcBaseDailyWage`를 함께.

## 건드리지 말 것
- `npc/economy.ts`는 942줄 — 늘리지 말고 새 모듈로. 생필품 받는 차례(`cityUnitOrder`)는 경계마다 앞에서부터라 일꾼이 먼저 먹는다(바꾸면 임금·포만감 셈이 바뀐다).

## 검사 (Verified)
- 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 한 번: 포맷·린트·타입·경계·크기·다국어(8,271키)·디자인 값(738쌍)·콘텐츠(core@150 6606e286b4b8) 통과,
  시험 파일 **793/793**, 시험 **5,888/5,888**.
- `pnpm check:content 0efec8a4a7`(호환 포함)·`pnpm check:docs 0efec8a4a7` 통과.
- 새 시험: 시뮬 `humanPurse.test.ts` 9개(기준 임금·일꾼 나눔·임금 = 생필품 값·굶은 일꾼 0·남는 돈과 숙박비 몫·낼 곳 모자람·끈 판·지갑 옮기기·상속·시뮬 전체 결정성),
  서버 `npcWages.test.ts` 5개(숙박비를 지갑에서 금고로·모자람·끈 판 국고·임금 낼 곳 금고 + 운영 자금·도시 직무 국고).
- 화면을 바꾸지 않아 화면 시험·빌드는 돌리지 않았다.

## 미검증·TODO·알려진 문제
- 서버 실제 세계에서 돌려 보지 않았다(미실행): 하루 끝 지갑 거래·숙박비가 운영 DB에 쌓이는 양(도시마다 하루 거래 1 + 숙소마다 1). 단위 시험·서버 NPC·사업장·노동 시험(DB 포함)만.
- NPC 휴먼이 수명 밖 길로 사라지면(지금 서버에는 없음 — 전투는 귀환·포로) 지갑 잔고가 남아 불변 조건 I12("cargo on missing units")에 걸릴 수 있다. 기본값에서 지갑은 하루 끝 뒤 거의 0이다.
- 지갑은 유닛 화물 위치라 전투 탈취(D-173)에 함께 털린다(플레이어 유닛 지갑과 같다).
- 세 시나리오(econ16·war16·build16) 30일만 쟀다. 180일·다른 시드는 재지 않았다.
- NPC 휴먼 지갑을 보는 화면 없음(질문 2294).

## 사용자 결정 대기
- 질문 2291~2295(`docs/questions/2026-11-16-npc-wage.md`).
