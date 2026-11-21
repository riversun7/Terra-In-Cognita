# 2026-11-21 묶음 1116v 합치기 (NPC 알박기 재료·운반 + 나라 의결 + NPC 판단 예약 저장) — 리셋 필요 없음

- 일시: 2026-11-21 15:56~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `21-1500-npc-claim-3`·`21-1549-claim-fill-fix`·`21-1530-governance`·`21-1530-npc-decide-fix`, 질문 2381~2385
  (`docs/questions/2026-11-21-npc-claim-3.md`)·2401~2410(`docs/questions/2026-11-21-governance-2.md`), ADR `2026-11-21-governance.md`(새, 제안),
  ADR "바뀜" 절(`2026-11-01-npc-brain-r5.md` — 줄기 npc-claim-3·npc-decide-fix)

## 한 일
- main 497aba3(묶음 1116u) 위에 세 줄기를 차례로 `--no-ff`로 합쳤다.
  1. `work/npc-claim-3`(4a09f38, 커밋 넷 — main 497aba3 합침 포함) — NPC 알박기 재료·운반(시뮬·서버 같은 규칙 `packages/sim/src/simulator/claimRules.ts`, 꾸러미 길
     `@terra/sim/claim`), 알박기 다 지은 도시 = NPC 가문(D-580, `SocietyRun.claimHouse`), 서버 3단계(`apps/server/src/npc/npcClaims.ts`·`npcCarry.ts`, 설정 칸
     `npc_claim_server` 기본 0 = 끔), 알박기 1분 지표(`npcClaimActive`·`npcClaimStarted`·`npcClaimFounded`·`npcClaimAbandoned`), 고침 4a09f38(시설 `fillCity`가 도시 없는
     행정 건물을 영토 지방 도시로 채우지 않음 — 다른 지방 안 알박기).
  2. `work/governance`(8088186, 커밋 넷) — 나라 의결: 안건·투표·선출·임기·체제 전환·선전포고, NPC 표, 세력 화면 투표 탭 의결 칸, tRPC `governance.view`, WS
     `gov_propose`·`gov_vote`·`gov_candidate` → `gov_result`, 마이그레이션 `20261121060714_governance`, 화면 시험 `e2e/governance.spec.ts`.
  3. `work/npc-decide-fix`(44f4a2c) — NPC 판단 예약을 세력 행 `factions.next_decide_ms`에 저장하고 켤 때 잇기(지났으면 3분 안 시드 흩기, 없으면 [0, 간격) 안),
     1분 지표 `npcNextDecideMin`, 마이그레이션 `20261121062521_npc_next_decide`.
- 최종 판:
  - 프로토콜 **56**(최소 **55**): governance 줄기 판 94(최소 93) → 묶음 판. `GOVERNANCE_PROTOCOL_VERSION` 56. 판 시험은 `MIN = 현재 − 1`(`boats.test.ts`)이라 고칠 것 없음.
  - 팩 **core@131**(줄기 판 npc-claim-3 170·governance 131 → 묶음 한 번). `tuning.json`은 칸 ID로 3방향 합침 — 저절로 합쳐졌다. 칸 826개, 같은 ID 두 번 없음,
    지운 칸 `npc_claim_cost`·`npc_claim_build_hours` 없음, `npc_claim_server` 있음, `gov_*` 16개(Verified). `id-changes.json`: npc-claim-3이 더한 두 줄의 `since` 170 → **131**
    (이 묶음에서 처음 올라가는 줄이라 고쳤다 — main의 옛 줄은 그대로).
  - `SIM_VERSION` **67**(npc-claim-3 줄기 판 106 → 묶음 판, `version.ts` 주석 67에 줄기 설명). governance·npc-decide-fix는 sim을 바꾸지 않았다.
  - 시뮬 출력 형식 **23** 그대로.
  - 마이그레이션: 형제 둘 그대로(둘 다 prevIds = 2d53a6a4) — `20261121060714_governance`(스냅숏 id `74cfa5b9-26db-4497-a517-6d62ca86c3f7`)·`20261121062521_npc_next_decide`
    (스냅숏 id `6429529b-49e0-4cd0-ab48-8bf2fd73fba0`). 합친 뒤 `pnpm --filter @terra/server db:generate` = "No schema changes"(Verified). 다음 마이그레이션 `prevIds` = 두 끝 모두
    **74cfa5b9**·**6429529b**(AGENTS.md 6장 Drizzle 갈래 규칙).
- `docs/worklog/2026/11/21-1440-batch-1116u-merge.md` 끝에 "## 배포 (Verified)" 절(1116u CI 373·NAS 배포·nas-metrics run 86, 조정 담당이 보낸 값)을 넣었다.

## 리셋 필요 여부: 필요 없음
- 마이그레이션 둘은 더하기뿐이다(governance = 새 표, npc-decide-fix = `factions` nullable 칸 하나). 지우는 것이 없고 직전 판 앱은 새 표·칸을 모른 채 그대로 돈다.
- 팩은 설정 칸 더하기(gov_* 16·알박기 칸) + 지운 칸 둘(`id-changes.json` 보상 없음). 프로토콜은 메시지 더하기뿐이고 최소 55라 55판 기기는 그대로 들어온다(56판 앱은 PWA로 받는다).
- 배포 뒤 운영 세계에서 바로 느껴질 바뀜:
  - **NPC 판단**: 첫 배포는 저장된 시각이 없어 켠 뒤 [0, 6시간) 안 시드 고른 점에 판단이 걸린다 — 첫 판단이 몇십 분 안에 보일 것(세력 17이라 약 20~30분 안, Assumed).
    그 뒤 배포는 저장된 시각을 잇는다. 판단이 돌기 시작하면 구인 카드(인구 증가)·전쟁·마을·연구·NPC 증축·조우 전투도 함께 돈다.
  - **알박기**: 서버 3단계는 `npc_claim_server` 0이라 짓지 않는다. 시뮬 쪽은 재료 규칙(경제 시나리오만).
  - **나라 의결**: 세력 화면 투표 탭에 의결 칸. NPC 가문도 열린 안건에 표를 던진다(체제 규칙대로).

## 손으로 푼 곳
- `content/core/manifest.json`(충돌, governance 합칠 때): 170·131 → **131**.
- `docs/WORKLOG.md`(충돌 두 번): 들어오는 쪽을 받은 뒤 `pnpm docs:index`(이 기록을 더한 뒤 다시).
- `apps/server/src/npc/runtime.ts`(충돌, npc-decide-fix 합칠 때): import 두 줄(`npcClaimsOf`·`createDecideClock`/`resumeDecides`) 모두 남김. 지표 덩이는 저절로 합쳐짐
  (`...claims?.takeMetrics()` + `metrics = zeroMetrics()`). 합친 뒤 **996줄**(≤ 999, 나누지 않음).
- `docs/adr/2026-11-01-npc-brain-r5.md`(충돌): 두 "바뀜" 절을 차례로(npc-claim-3 → npc-decide-fix) 남기고, npc-claim-3 절 판 줄을 "SIM_VERSION 67(묶음 1116v, 줄기 판 106) … 팩
  core@131(묶음 1116v, 줄기 판 170)"로.
- 판 번호 설명: `packages/protocol/src/version.ts`(94 → 56 절, MIN 설명에 "56부터 54판 이하"), `governance.ts`·`governance.test.ts` 머리 주석, `apps/server/src/session.ts` 주석,
  `docs/adr/2026-11-21-governance.md`(제안 상태 — 제목·4절·6절의 줄기 판 → 프로토콜 56·core@131), `packages/sim/src/version.ts`(106 → 67). 줄기 작업 기록의 줄기 판은 줄기 기록이라
  그대로 둔다.
- 메시지 ko·en은 governance만 바꿔 충돌 없음 — paraglide 다시 컴파일.
- 파일 크기: 넘은 파일 없음. 큰 파일: `apps/server/src/facilities/service.ts` 999, `apps/server/src/npc/runtime.ts` 996.
- 거래소 표 누수 규칙: 합친 서버 바뀜에 `cityMap.get` 새 호출 없음(Verified: 바뀐 서버 파일 검색).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json`, `content/core/id-changes.json` | 팩 판 core@131, 지운 칸 둘의 since 131 |
| `packages/protocol/src/version.ts`, `packages/protocol/src/governance.ts`, `packages/protocol/src/governance.test.ts`, `apps/server/src/session.ts` | 프로토콜 56(최소 55), 주석 |
| `packages/sim/src/version.ts` | SIM_VERSION 67 |
| `apps/server/src/npc/runtime.ts` | 합침 충돌(import 둘) |
| `docs/adr/2026-11-01-npc-brain-r5.md`, `docs/adr/2026-11-21-governance.md` | 충돌·판 번호 설명 |
| `docs/worklog/2026/11/21-1440-batch-1116u-merge.md` | 1116u 배포 결과 절 |
| `docs/worklog/2026/11/21-1556-batch-1116v-merge.md`, `docs/WORKLOG.md` | 이 기록·목차 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 57(최소 56), 팩 132, SIM 68, 시뮬 출력 형식 24. 다음 마이그레이션 `prevIds` = 74cfa5b9·6429529b(두 끝).
- `npc/runtime.ts`(996)·`facilities/service.ts`(999)를 늘리면 새 모듈로 나눈다. `npc/economy.ts`(981)·`packages/sim/src/index.ts`(991)도 같다.
- 앞 묶음들의 "함께 바꿔야 하는 파일" 그대로: 거래소를 읽기만 할 때는 `peekMarket`, **다음 배포에서 옛 `exchange_lockers` 표를 지운다**(1116n TODO).
- 줄기 기록 넷의 "함께 바꿔야 하는 파일"을 그대로 따른다.

## 건드리지 말 것
- 마이그레이션 `20261121060714_governance`·`20261121062521_npc_next_decide`(갈래는 다시 만들지 않고 그대로 합친다).
- 설정 칸 `npc_claim_server` 출발값 0(NAS 확인 뒤 켜기 — 질문 2382).
- 서버 전용 난수 흐름 101(판단 예약 흩기 — 시뮬 흐름 1~10과 겹치지 않음).
- 줄기 기록 넷의 "건드리지 말 것".

## 검사 (Verified)
- 합친 판(판 손질 뒤) 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 한 번: 포맷·린트·타입·모듈 경계·파일 크기·다국어(8,590키)·디자인 값(746쌍)·콘텐츠
  (core@131 ee825b3c70e0) 통과, 시험 파일 **824/824**, 시험 **6,020/6,020**(`@terra/sim` 골든 포함 — SIM 67).
- `pnpm check:content 497aba3e97`(core@131 ee825b3c70e0, 단계 1·2·4a·4b), `pnpm check:docs 497aba3e97`, `pnpm settings:cells --check`, `pnpm wiki:index --check`(항목 40개),
  `pnpm --filter @terra/server db:generate` = "No schema changes" 모두 통과.
- `apps/game`이 바뀌어(의결 칸) `pnpm build` 통과, `check-pwa` 통과, `pnpm check:bundle` 첫 화면 JS **110,512 B** / 상한 131,416 B(파일 7개, governance 줄기 110,515 B와 거의 같음 —
  의결 칸은 세력 화면 지연 조각).
- 화면 시험 한 번(`pnpm e2e e2e/governance.spec.ts e2e/faction.spec.ts`, 1.7분): **27/34 통과**. `governance.spec.ts` **6/6 통과**. `faction.spec.ts` **21/28** — 실패 7개는
  모두 `smallTapTargets`(누르는 곳 38px: 뒤로·탭 단추·가문 창설 등 `--control-h-sm` 높이, 의결 칸 요소는 목록에 없음)로 랭킹 화면과 같은 알려진 문제(사용자 결정 대기).
  가로 넘침·명령·기기 오류 단언은 그 앞에서 통과했다.

## 미검증·TODO·알려진 문제
- npc-claim-3(줄기 기록에 자세히): 서버 알박기는 기본 꺼짐(`npc_claim_server` 0) — NAS에서 판단·지표를 본 뒤 켠다(질문 2382). 서버 3단계를 실제 세계에서 켜 본 적 없음(미실행).
- governance(줄기 기록에 자세히): 지금 NAS 세계의 자본주의 NPC 나라는 국고 지분만 있어 투표권이 비고, 안건이 규칙대로 늘 정족수 미달로 끝난다(D-581 — 다른 주주가 생기면
  돈다). 선출된 지배 가문은 지금 의결 안에서만 쓴다(질문 2406). 영어 고르기 칸 여백 고침 뒤 사진을 다시 찍지 않았다(줄기 기록).
- npc-decide-fix: NAS에서 아직 보지 않았다. 배포 뒤 `npcNextDecideMin`이 줄어들고 `npcDecisions` > 0인지 본다. 첫 판단은 약 20~30분 안(Assumed).
- **화면 시험 누르는 곳 38px**: `e2e/ranking.spec.ts` 등의 `smallTapTargets` 실패는 그대로(사용자 결정 대기 — 토큰 `--control-h-sm` 되돌리기 또는 시험 문턱 고치기).

## 사용자 결정 대기
- 질문 2381~2385(npc-claim-3), 2401~2410(governance), 앞 묶음의 2371~2375·2391~2392·2344·2331~2336·2341~2348·2321~2327·2311~2317·2301~2306·2291~2295·2251~2259·
  2261~2270·2271~2278·2281~2285, 1116o의 2231~2244, 1116n의 2201~2207·2211~2215·2221~2224. 화면 누르는 곳 38px.
