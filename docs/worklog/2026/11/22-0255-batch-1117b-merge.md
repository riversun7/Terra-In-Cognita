# 2026-11-22 묶음 1117b 합치기 (광산 무게 / 가문 연맹 바로잡기·NPC 투자 / 지분 시장 2 / 빈자리 계승·사는 곳 정원) + 미러 eb8960a — 리셋 필요 없음

- 일시: 2026-11-22 02:55~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `22-0122-stone-balance`·`22-0124-league-fix`·`22-0230-share-market-2`·`22-0211-governance-6`, 질문 `docs/questions/2026-11-22-stone-balance.md`(2511)·
  `2026-11-22-league-fix.md`(2501~2508)·`2026-11-21-share-market-2.md`(2521~2530)·`2026-11-21-governance-6.md`(2531~2538), ADR `2026-11-22-ore-yield-mass.md`·
  `2026-11-21-npc-needs-drives.md`·`2026-11-21-share-market-2.md`·`2026-11-21-governance.md`·`2026-11-15-business-ledger.md` "바뀜" 절

## 한 일
- main 25273679b5(묶음 1117a 기록) 위에 네 줄기를 차례로 합쳤다(모두 바탕 25273679b5, 합치기 커밋 `--no-ff`).
  1. `work/stone-balance`(3769b9514c): 광산 한 사이클 무게를 g 단위 바뀜 전으로 — 설정 칸 `n44_ore_grams` 1 → 20, 시뮬 계수표 기본값 같이(D-587 11 나).
  2. `work/league-fix`(6708397b82): 가문 연맹 = 가문 조약 순수 함수(`factionIdentity/houseLeague.ts`, 옛 `npc/houseLeague.ts`·`sim/npc/leagueBrain.ts` 지움), NPC 투자 판단
     (`sim/npc/invest.ts`), 비접속 관리인 늘 켬. 설정 칸 +3(`npc_invest_*`)·−3(`npc_ai_league_dues_pm`·`npc_ai_league_lot`·`npc_ai_offline_steward_enabled`, `id-changes.json` 뒤에 추가).
  3. `work/share-market-2`(f315b67514): D-587 지분 시장 2 — NPC 지분 주문, 사업장 남는 주문, 거래세·증권 거래소 이용료, 국고 주문 거두기, 도시마다 독재 과반, 국고 지분 사기 안건. 설정 칸 +5.
  4. `work/governance-6`(c33f1a6a82, 코디네이터가 묶음 중간에 더함): 빈자리 자동 계승·가문 후계자(`house_heirs`), 사는 곳 정원(`residence_capacity_per_level`)·쉼 알림
     (`unit_residences.paused_since_ms`, 처리할 일 `residence_paused`), 폐허 복원 빚, 주민세 주기 목록. 설정 칸 +1, 설명 셋.
- 기획 미러를 AntiGravt01 `claude/sweet-wright-4ubb2u` **eb8960a**로 동기화했다(앞 미러 eaa9a8f → D-579~D-588, 바뀐 파일 `00_README.md`·`02_Decision_Log.md`·`03_Planning_Rules.md`,
  지운 파일 없음, 결정 로그 D-001~D-588·Step 5 D-5068·Step 6 D-6049·Step 7 D-7054). `49_Settings.md`는 바뀌지 않아 `pnpm settings:cells`는 돌리지 않았다(`--check` 최신).
  `pnpm check:wiki --stale`: 알림 26줄(모두 옛 결정의 "대체" 표시 — 보고만, 위키는 고치지 않음).
- 묶음 1117a 기록(`22-0110-batch-1117a-merge.md`) 끝에 "배포 (Verified)" 절을 붙였다(코디네이터 배포 메모 그대로).

## 판 번호 다시 매김
| 무엇 | main | 줄기 판 | 묶음 판 |
|---|---|---|---|
| 프로토콜 | 61(최소 60) | share-market-2 101/100, governance-6 111/110 | **62(최소 61)** — 두 줄기 기능을 한 판에. `SHARE_BUY_PROTOCOL_VERSION`·`HOUSE_HEIR_PROTOCOL_VERSION`·`RESIDENCE_FULL_PROTOCOL_VERSION` = 62 |
| 팩 core | 139 | share-market-2 179, league-fix 180, stone-balance 181, governance-6 189 | **140** |
| SIM_VERSION | 71 | stone-balance 111, league-fix 140 (share-market-2·governance-6 그대로) | **72** — 두 판정 바뀜을 한 절에(① 광석 20g ② NPC 투자 판단) |

- 프로토콜: `version.ts` 62 절에 share-market-2·governance-6을 함께 적었다. 줄기 코드 주석의 "101(줄기 판)"·"111"을 62로(`business.ts`·`cityShares.ts`·`governance.ts`·`house.ts`·`residence.ts`,
  `houseCommands.ts`, `gather/gateway.ts`). `residence.test.ts`는 1117a처럼 `toBe(62)` + `PROTOCOL_VERSION ≥`로(다음 묶음이 판을 올려도 깨지지 않게).
- 팩: `manifest.json` 140. `id-changes.json`은 league-fix가 뒤에 더한 세 줄의 `since` 180 → **140**만 바꿨다(main 줄 그대로, 세 줄은 끝에 그대로). `tuning.json` 칸 948 → **953 + 1 = 954**
  (league-fix +3·−3, share-market-2 +5, governance-6 +1).
- SIM: 시험 주석 "SIM 140" → 72(`guards.test.ts`·`npcBuild.test.ts`). 줄기 골든·해시는 줄기에서 맞춘 그대로 통과했다(다시 만들지 않음 — 아래 검사).
- ADR 판 줄을 묶음 판으로(`2026-11-22-ore-yield-mass.md`·`2026-11-21-npc-needs-drives.md`·`2026-11-21-share-market-2.md`·`2026-11-21-governance.md`·`2026-11-15-business-ledger.md`,
  줄기 판은 괄호에 남김). 줄기 작업 기록은 줄기 판 그대로 두었다.

## 마이그레이션
- 줄기 것 그대로, 둘 다 prevIds = 1117a 끝 셋(`90e99c42`·`e44a1520`·`8ccb7e3f`)인 형제 갈래:
  - `20261121170947_share_market_2`(스냅숏 id `96600b4f-7a5b-4d2e-baa5-d735cd2c2d0c`): 안건 종류 검사에 `treasury_share_buy` 더함(넓히기만).
  - `20261121172306_governance6_heirs_residence`(`9ef728d3-faa7-4b70-bef5-a67d304631b3`): 새 표 `house_heirs`, 새 칸 `unit_residences.paused_since_ms`(null 허용).
- 합친 뒤 `pnpm --filter @terra/server db:generate` = "No schema changes"(Verified).
- 다음 마이그레이션 `prevIds` = 끝 둘 **96600b4f-7a5b-4d2e-baa5-d735cd2c2d0c**·**9ef728d3-faa7-4b70-bef5-a67d304631b3**.

## 질문 번호
- 2501~2508(league-fix)·2511(stone-balance)·2521~2530(share-market-2)·2531~2538(governance-6) — main(2500까지)과 서로 겹치지 않아 옮기지 않았다.

## 리셋 필요 여부: 필요 없음
- 마이그레이션은 검사 넓히기·새 표·null 칸뿐이라 직전 판 앱이 그대로 돈다. 프로토콜은 더하기만이고 최소 61이라 61판 기기는 그대로 들어온다.
- 팩: 설정 칸 더하기·빼기(뺀 셋은 `id-changes.json`에 기록)와 `n44_ore_grams` 값. 광석 수확이 사이클당 20배 무게로 돌아온다(옛 g 단위 전과 같은 무게).
- 옛 연맹 기금 계정(`league:city:*`) 잔고는 그대로 남는다(질문 2505).

## 손으로 푼 곳
- `packages/sim/src/version.ts`(111·140 → 72 한 절), `content/core/manifest.json`(세 번, 140), `packages/protocol/src/version.ts`(62 절 + 최소 61), `docs/WORKLOG.md`(+ `pnpm docs:index`).
- 저절로 합쳐진 곳: `content/core/tuning.json`, `governance/service.ts`(share-market-2 + governance-6, 961줄), `sim/simulator/npcRun.ts`, 메시지 ko·en(8,811키씩).
- 파일 크기: 넘은 파일 없음. 큰 파일: `sim/src/simulator/society.ts` 999, `world/persist/tables.ts` 997, `sim/src/index.ts` 996, `apps/server/src/app.ts` 1000, `session.ts` 976.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/protocol/src/version.ts`, `governance.ts`, `business.ts`, `cityShares.ts`, `house.ts`, `residence.ts`, `residence.test.ts` | 프로토콜 62(최소 61), 줄기 상수 62 |
| `apps/game/src/faction/identity/houseCommands.ts`, `apps/server/src/gather/gateway.ts` | 판 주석 |
| `content/core/manifest.json`, `id-changes.json` | 팩 core@140, league-fix 뺀 칸 since 140 |
| `packages/sim/src/version.ts`, `simulator/guards.test.ts`, `simulator/npcBuild.test.ts` | SIM 72 |
| `docs/adr/` 다섯(위) | 판 줄 |
| `docs/design/`(README 빼고), `docs/design/README.md` | 미러 eb8960a, 원본 커밋·동기화 시각 |
| `docs/worklog/2026/11/22-0110-batch-1117a-merge.md` | 1117a 배포 확인(Verified) 절 |
| `docs/worklog/2026/11/22-0255-batch-1117b-merge.md`, `docs/WORKLOG.md` | 이 기록·목차 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 63(최소 62), 팩 141, SIM 73. 다음 마이그레이션 `prevIds` = 끝 둘(위).
- `sim/src/simulator/society.ts`(999)·`world/persist/tables.ts`(997)·`sim/src/index.ts`(996)·`apps/server/src/app.ts`(1000)를 늘리면 새 모듈로 나눈다.
- 줄기 기록 넷의 "함께 바꿔야 하는 파일"·"건드리지 말 것"을 따른다.

## 건드리지 말 것
- 마이그레이션 `20261121170947_share_market_2`·`20261121172306_governance6_heirs_residence`(올라간 뒤 고치지 않는다).
- 연맹 조약에 저장·명령·화면을 지어 붙이지 않는다(2501·2502 답 전). 건물·배·알박기의 석재 수량(g)은 그대로.

## 검사 (Verified)
- 네 줄기를 다 합친 뒤(판 손질 뒤) 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 한 번: 포맷(3,322파일)·린트·타입·모듈 경계·파일 크기·다국어(8,811키)·디자인 값(746쌍)·
  콘텐츠(core@140 ebe6c92795e5) 통과, 시험 파일 **871/871**, 시험 **6,244/6,244**(건너뜀 0, `@terra/sim` 골든 포함 — 알려진 흔들림 `governance.db.test.ts`·`npc/cityBuild.db.test.ts`도 이번엔 통과).
  (governance-6을 넣기 전 판으로 돌리던 검사는 잠금 대기 중에 멈추고 이 한 번만 돌렸다.)
- `pnpm check:content`(호환 포함, core@140 ebe6c92795e5, 단계 1·2·4a·4b 기준 2527367), `pnpm check:docs`, `pnpm settings:cells --check`, `pnpm wiki:index --check`(항목 40개),
  `pnpm --filter @terra/server db:generate` = "No schema changes" 모두 통과. `pnpm docs:index`로 목차를 다시 만들었다.
- `apps/game`이 바뀌어 `pnpm build` 통과(PWA 포함), `pnpm check:bundle` 첫 화면 JS **110,766 B** / 상한 131,416 B(1117a 110,784 B에서 −18 B, 파일 7개).
- 화면 시험(빌드한 앱, 한 번, 한 실행 13.8분): `share-market.spec.ts` **9/9**, `economy.spec.ts` **27/27**(stone-balance가 맞춘 기대값 — 1117a의 낡은 기대값 둘 해소),
  `faction.spec.ts` **28/28**(알려진 누름 크기 실패는 이번 실행에서 나오지 않음), `inbox.spec.ts` **17/17** — 합 **81/81**. 결과 폴더는 지웠다. `dev.spec.ts`는 미실행(위 미검증).

## 미검증·알려진 문제
- share-market-2: 새 화면 칸(국고 지분 사기 카드·국고 주문 거두기·거래세 줄·이용료 칸)은 화면 시험 단언이 없다(줄기 그대로 미검증). NPC 지분 매매가 운영 세계에서 쌓이는 모양은 Unknown.
- league-fix: 서버 실제 세계의 관리인 24시간 넘김·NPC 연구 빈도 변화는 재지 않았다(줄기 그대로). `/dev/npc-ai` 칸 목록 바뀜은 `e2e/dev.spec.ts`가 칸을 단언하지 않아 돌리지 않았다(미실행).
- governance-6: 실제 세계의 자동 계승·쉼 알림은 DB 시험으로만 봤다.
- stone-balance: 화면 "한 번에 100개"는 수확 단위(× 20g) — 문구는 남은 일. `e2e/tuning.spec.ts`(N44 줄)는 미실행.
- 1117a 배포 메모의 "market escrow differs after restore"(시장 8곳)는 원인 Unknown 그대로.

## 사용자 결정 대기
- 질문 2511(stone-balance), 2501~2508(league-fix), 2521~2530(share-market-2), 2531~2538(governance-6), 그리고 1117a 기록의 대기 목록(2491~2500·2481~2486·2471~2480·2461~2467 …).
