# 2026-11-21 묶음 1116u 합치기 (주민세 구조 + 고침 1116t) — 리셋 필요 없음

- 일시: 2026-11-21 14:40~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `21-1415-resident-tax`·`21-1430-fixes-1116t`, 질문 2371~2375(`docs/questions/2026-11-21-resident-tax.md`)·2391~2392
  (`docs/questions/2026-11-21-fixes-1116t.md`), ADR "바뀜" 절(`2026-11-15-business-ledger.md`·`2026-11-11-faction-identity.md`·`2026-11-03-labor-contracts.md`·
  `2026-11-07-ranking.md`·`2026-11-16-logistics-center.md`)

## 한 일
- main 954fe23(묶음 1116t) 위에 두 줄기를 차례로 `--no-ff`로 합쳤다(둘 다 바탕 954fe23).
  1. `work/resident-tax`(36b5cfd, 커밋 둘) — 주민세 구조(D-579: 재산 바탕·나라 주기·사는 도시·빚, 세율 0 = 안 걷음, `packages/sim/src/society/residentTax.ts`·
     `simulator/societyPayouts.ts`, 서버 재산 값 고리 `apps/server/src/npc/residentProperty.ts`), 가문세·소득세를 둘 다 총 임금에서 따로(`economy/laborContract.ts`), 설정 칸 둘 새·하나
     설명 고침, `packages/sim/src/index.ts` 999 → 991줄.
  2. `work/fixes-1116t`(beb294a) — 랭킹 가문 몫 감쇠형 점수(`ranking/houseScores.ts`·새 표 `ranking_house_scores`), 유닛 판에서 규모 시험 봇 빼기, NPC 물류센터 운반꾼 임금
     (`npcLogistics.ts payCenterHaulers`), 물류센터 둘째·셋째 증축, 운반꾼을 자기 짐 운반꾼 수에서 빼기, governance·house-10 질문 문서 고침.
- 최종 판:
  - 프로토콜 **55**(최소 **54**) 그대로.
  - 팩 **core@130**(줄기 판 resident-tax 130·fixes-1116t 175 → 묶음 한 번 올림). `tuning.json`은 칸 ID로 3방향 합침 — 자동으로 합쳐졌고 두 줄기 칸이 모두 있다(resident-tax
    `nation_resident_tax_every_ms`·`nation_resident_tax_nation_pm` 새 + `nation_resident_tax_pm`·`business_wage_withhold_mode` 설명, fixes-1116t `logistics_npc_build_waits`·
    `logistics_npc_build_humans` 설명). 칸 810개, 같은 ID 두 번 없음(Verified). `id-changes.json` 그대로.
  - `SIM_VERSION` **66** 그대로(resident-tax: 세율 0·시뮬 재산 고리 없음·시뮬은 노동 계약 없음 → econ16 시드 1·2 30일 출력이 팩 판·해시 밖에서 같음, 줄기 기록 Verified.
    fixes-1116t: sim은 계수표 주석만).
  - 시뮬 출력 형식 **23** 그대로.
  - 마이그레이션: fixes-1116t의 `20261121051017_ranking_house_scores` 그대로(prevIds = 65053bfd). 합친 뒤 `pnpm --filter @terra/server db:generate` = "No schema changes"
    (Verified). 다음 마이그레이션 `prevIds` = **2d53a6a4**(이 마이그레이션 스냅숏 id `2d53a6a4-006b-4ecb-8057-b0b0330ff694`).
- `docs/worklog/2026/11/21-1345-batch-1116t-merge.md` 끝에 "## 배포 (Verified)" 절(1116t CI 372·NAS 배포·nas-metrics run 85, 조정 담당이 보낸 값)을 넣었다.
- 운반꾼 임금과 원천징수(합친 뒤 확인, Verified: 소스 읽기): `payCenterHaulers`는 시설 일꾼 임금(`npcWages.ts`)과 같은 `npc_living` 거래로 물류센터 금고 → 휴먼 지갑에 준다.
  resident-tax의 "가문세·소득세 둘 다 총 임금" 바뀜은 노동 계약 임금(`labor/wagePurse.ts withWageTaxes` → sim `wageEntries`)에만 걸리고, NPC 임금은 원천징수·가문세를 떼지 않는다
  (둘 다 1116s부터 그대로). 그래서 `payCenterHaulers`는 고치지 않았다. NPC 임금에 세금을 넣게 되면 시설 일꾼 임금과 운반꾼 임금을 함께 바꾼다.

## 리셋 필요 여부: 필요 없음
- 프로토콜 그대로. 마이그레이션은 새 표 `ranking_house_scores` 하나 더하기뿐이라 지우는 것이 없고, 직전 판 앱은 그 표를 모른 채 그대로 돈다. 팩은 설정 칸 더하기·설명 고침.
- 주민세는 세율 0이라 걷지 않는다(주기 일도 돌지 않는다). 빚 계정·주민세 거래는 생기지 않는다.
- 배포 뒤 운영 세계에서 바로 느껴질 바뀜:
  - **가문세**: 가문원 유닛의 임금형 계약 임금에서 가문세가 총 임금 기준으로 조금 커진다(가문세율 × 소득세만큼).
  - **랭킹**: 다음 집계(UTC 0시)부터 가문 몫 점수가 0에서 쌓이기 시작한다. 유닛 판에서 NAS 규모 시험 봇 1,000이 빠진다.
  - **NPC 물류센터**: 운반꾼이 하루 끝마다 임금을 받는다(국고 지출이 그만큼 는다). 운반 수요가 계속 큰 NPC 도시는 물류센터를 더 짓는다.

## 손으로 푼 곳
- `content/core/manifest.json`(충돌): 130·175 → **130**.
- `docs/WORKLOG.md`(충돌): fixes-1116t 쪽을 받은 뒤 `pnpm docs:index`(이 기록을 더한 뒤 다시).
- 판 번호 설명(줄기 판 괄호): `docs/adr/2026-11-07-ranking.md`·`docs/adr/2026-11-16-logistics-center.md`(core@130 — 줄기 판 175), `docs/adr/2026-11-15-business-ledger.md`
  ("줄기 판 — 합칠 때 묶음 판으로" → 묶음 1116u, 줄기 판도 130). 줄기 작업 기록의 줄기 판(130·175)은 줄기 기록이라 그대로 둔다.
- 겹친다던 `npc/economy.ts`(`afterDay`)·`npc/rulingVault.ts`는 한 줄기만 바꿔 충돌이 없었다(resident-tax는 `rulingVault.ts`, fixes-1116t는 `economy.ts`).
- 메시지 ko·en은 두 줄기 모두 바꾸지 않았다(`apps/game` 바뀜 없음) — paraglide 다시 컴파일·빌드·묶음 크기 검사는 하지 않았다.
- 파일 크기: 넘은 파일 없음. 큰 파일: `packages/sim/src/index.ts` 991, `apps/server/src/npc/economy.ts` 981, `packages/sim/src/simulator/society.ts` 889.
  `world.ts`·`app.ts` 999, `npc/runtime.ts` 995는 두 줄기가 건드리지 않았다.
- 거래소 표 누수 규칙: 합친 서버 바뀜에 `cityMap.get` 새 호출 없음(Verified: diff 검색).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json` | 팩 판 core@130 |
| `docs/adr/2026-11-07-ranking.md`, `docs/adr/2026-11-16-logistics-center.md`, `docs/adr/2026-11-15-business-ledger.md` | 판 번호 설명(줄기 판 괄호) |
| `docs/worklog/2026/11/21-1345-batch-1116t-merge.md` | 1116t 배포 결과 절 |
| `docs/worklog/2026/11/21-1440-batch-1116u-merge.md`, `docs/WORKLOG.md` | 이 기록·목차 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 56, 팩 131, SIM 67, 시뮬 출력 형식 24. 다음 마이그레이션 `prevIds` = 2d53a6a4.
- 앞 묶음들의 "함께 바꿔야 하는 파일" 그대로: 거래소를 읽기만 할 때는 `peekMarket`, 국가 지도자 지갑은 npc-wage 지갑 옮기기·상속 밖, **다음 배포에서 옛 `exchange_lockers` 표를
  지운다**(1116n TODO).
- NPC 임금에 원천징수·가문세를 넣게 되면 `npcWages.ts`(시설 일꾼)와 `npcLogistics.ts payCenterHaulers`(운반꾼)를 함께.
- `npc/economy.ts`(981)를 늘리면 새 모듈로 나눈다. `npc/runtime.ts`(995)·`packages/sim/src/index.ts`(991)도 같다.
- 줄기 npc-claim-3(아직 도는 중)을 합칠 때 다음 판(위)과 prevIds 2d53a6a4를 쓴다.
- 줄기 기록 둘의 "함께 바꿔야 하는 파일"을 그대로 따른다.

## 건드리지 말 것
- 마이그레이션 `20261121051017_ranking_house_scores`.
- 주민세 세율 0이면 `collectResidentTax`가 고리를 부르기 전에 돌아간다(시뮬 출력 바이트 같음).
- 설정 칸 ID `nation_resident_tax_*` 셋·`logistics_npc_build_*` 둘.
- 줄기 기록 둘의 "건드리지 말 것".

## 검사 (Verified)
- 합친 판(판 손질 뒤) 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 한 번: 포맷·린트·타입·모듈 경계·파일 크기·다국어(8,504키)·디자인 값(746쌍)·콘텐츠
  (core@130 75b1415ec79a) 통과, 시험 파일 **814/814**, 시험 **5,981/5,981**(`@terra/sim` 골든 포함 — SIM 66 그대로).
- `pnpm check:content 954fe231c4`(core@130 75b1415ec79a, 단계 1·2·4a·4b), `pnpm check:docs 954fe231c4`, `pnpm settings:cells --check`, `pnpm wiki:index --check`(항목 40개), `pnpm --filter @terra/server db:generate` = "No schema changes" 모두 통과.
- `apps/game`이 바뀌지 않아 `pnpm build`·`check-pwa`·`check:bundle`·e2e는 돌리지 않았다.

## 미검증·TODO·알려진 문제
- **줄기 npc-claim-3이 아직 돈다**(서버 NPC 알박기 3단계). 이 묶음에 들지 않았다.
- resident-tax(줄기 기록에 자세히): 서버 실제 세계에서 세율을 올려 돌려 보지 않았다(미실행 — 지금 사는 도시가 있는 유닛은 거의 같은 주머니라 걷힐 곳이 적을 것, Assumed, 질문 2372).
  재산 값 = 그 도시 사업장 금고만 [임시](건물·주거 값 없음, 질문 2371). 빚 계정·주민세 거래의 DB 저장은 DB 시험 없음(Assumed — 원장 길 그대로). 신용 체계 없음(빈틈 2374), 나라마다
  세율·주기 저장·화면 없음(2373).
- fixes-1116t(줄기 기록에 자세히): 운반꾼 임금·물류센터 둘째 증축을 실제 세계(NAS)에서 보지 않았다(단위 시험만). 가문 몫 점수는 배포 뒤 0에서 시작한다(몇 번의 집계 동안 작게 보일 수
  있다). 랭킹 집계 부하 측정 안 함(Unknown). 운반꾼 임금 포만감 배율 없음(질문 2391), 시험 봇 전투력은 시험 NPC 세력 몫에 든다(2392).
- **랭킹 화면 시험 누르는 곳 38px**: `e2e/ranking.spec.ts`의 `smallTapTargets` 실패 셋은 그대로(사용자 결정 대기 — 토큰 `--control-h-sm` 되돌리기 또는 시험 문턱 고치기).
- 시뮬(econ16 등)은 합친 판에서 다시 돌리지 않았다 — resident-tax 줄기가 같은 바탕에서 전·후를 쟀고, fixes-1116t의 sim 바뀜은 주석뿐이다.

## 사용자 결정 대기
- 질문 2371~2375(resident-tax), 2391~2392(fixes-1116t), 2344, governance 2351·2355·2356·2357·2358·2363, 앞 묶음의 2331~2336·2341~2348·2321~2327·2311~2317·2301~2306·
  2291~2295·2251~2259·2261~2270·2271~2278·2281~2285, 1116o의 2231~2244, 1116n의 2201~2207·2211~2215·2221~2224. 화면 누르는 곳 38px.

## 배포 (Verified)
- main 497aba3, CI 373 성공(05:58:59 UTC 끝): 앱 05:57:55 UTC 다시 켬, 이미지 sha-497aba3e9724, core@130 확인. 행성 2개 캐시. 세계는 새로 시작하지 않았다.
- nas-metrics run 86(최근 20분, 1분 지표 20줄): RSS 556 → 575MB(54~56%, 거의 평평), 루프 p99 1.0~1.6ms, 루프 최대 14.7~65.3ms, DB 실패 0, 커밋 평균 84~101ms·최대 224~775ms, dbPending 1~50, 경로 대기 p95 0.9~1.3ms, 경로 실패 0. econProduced 분마다 5~154, NPC 판매 1~86. 도시 50·건물 1,191·휴먼 3,451·유닛 4,469·세력 17. 서버 경고·오류 0, 기기 오류 0(기기 샘플 2건 fps 약 120, p95 9.2ms).
- npcPersistMs 73~79ms(첫 3분) → 170~206ms(그 뒤 평평).
- **발견**: npcDecisions가 20분 내내 0(직전 배포 8분 창도 0). 원인(Verified, 코드): 판단 간격 6시간 ±25%이고 서버를 켤 때 모든 세력의 첫 판단을 켠 시각 + 4.5~7.5시간으로 다시 짠다(다음 판단 시각을 저장하지 않음, `npc/runtime.ts` 시작부). 배포가 1~2시간마다 있어 NPC 세력 판단(구인·전쟁·알박기 등)이 사실상 돌지 않았다 → 줄기 npc-decide-fix가 고친다.
