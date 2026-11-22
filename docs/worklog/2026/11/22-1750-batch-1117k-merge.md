# 2026-11-22 묶음 1117k 합치기 (적색 부상 귀환 순간이동(D-594 보충) / 1117j 기획 검토 고침 / 기획 미러 989a9f2(D-593~D-594)) — 리셋 필요 없음

- 일시: 2026-11-22 17:50~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `22-1740-return-home`·`22-1800-fixes-1117j`, 질문 `docs/questions/2026-11-22-return-home.md`(2751~2755)·`2026-11-22-fixes-1117j.md`(2761~2765),
  ADR `2026-11-15-unloaded-second-maps.md`·`2026-11-08-injury.md`·`2026-11-21-governance.md`(return-home·fixes-1117j), `2026-11-07-world-layout.md`·`2026-11-15-business-ledger.md`·`2026-11-11-faction-identity.md`(fixes-1117j),
  기획 D-351·D-381·D-521·D-555·D-591·D-592·D-593·D-594

## 한 일
- main **d375e07de9** 위에 줄기 둘을 차례로 합쳤다(합치기 커밋 `--no-ff`, 기본 메시지). 두 줄기 모두 바탕 334f0cc429(묶음 1117j).
  처음에는 334f0cc429 위에 return-home만 합쳐 푸시했는데 main이 움직여 거절됐고(푸시 전 훅 도중), 조정자 지시로 fixes-1117j를 더해 지금 main 위에서 다시 묶었다(옛 묶음 가지는 버림).
  - main이 그사이 받은 것(334f0cc429 → d375e07de9, 다른 세션이 직접 올림): `c6e4790555` 요리 71종·요리 버프 6종·주방 레시피 71종(D-472, 팩 core@149 — 항목 더하기만, `id-changes.json` 그대로),
    `d375e07de9` 밸런스 전투 시험 3D 리플레이 통합(`apps/game` 개발 화면). 프로토콜·SIM·마이그레이션은 바뀌지 않았다(Verified: diff).
  1. `work/return-home`(2015b226bf): 적색 부상(D-521 3단계)으로 진 유닛만 돌아갈 곳으로 **순간이동**(D-591의 유일한 예외) — 사는 곳 → 소속 도시 → 소속 국가 정부 건물 →
     적대 아닌 가까운 도시(새 `world/unitHome.ts`·`unitHomeWorld.ts`, 옛 `cyborgHome.ts` 이름 바꿈). 가벼운 부상은 그 자리, 포로는 D-381대로 걷기.
     fixes-1117i의 실제 이동 귀환 몫(`travel/service.ts`·`planner.ts`·`serviceTypes.ts`·`world/secondMap.ts`의 `returning`·`ignoreCondition`)을 지웠다. 시험 `unitHome.test.ts` 12개, 새 `returnHome.db.test.ts` 2개. 충돌 없음.
  2. `work/fixes-1117j`(1ffde34d4f): NPC 가문 쿠데타는 성향대로 + 기본 NPC 국가에서는 NPC 가문도 힘 비 문(`governance/coup.ts`, `gov_fixed_coup_loyalty` 100 → 40), 도시 직무 일꾼 작업 부상
     (`npc/humanPlaces.ts`·`npc/npcWorkInjury.ts`), 고정 세력의 잃은 도시 기억(`SimFaction.lostCities`, `simulator/societyWar.ts`·`npcRun.ts`, 서버 `npc/lostCities.ts` + 새 표 `npc_lost_cities`),
     NPC 집주인(`residence/npcLandlord.ts`, 설정 칸 `npc_landlord_*` 셋), 쿠데타 전투 같은 가문 `kin`(`@terra/sim combat/kin.ts`, `world/battleBodies.ts`, `governance/coupWorldBattle.ts`).
- 충돌과 푼 방법(fixes-1117j를 합칠 때):
  - `content/core/manifest.json`: 판 다시 매김(아래). `docs/WORKLOG.md`: 다시 만듦.
  - ADR `2026-11-08-injury.md`·`2026-11-21-governance.md`: 같은 자리에 return-home 절과 fixes-1117j 절 → 둘 다(return-home 다음 fixes-1117j).
  - 질문 `2026-11-22-fixes-1117i.md` 상태 줄: 둘 다(2744는 두 줄 모두 "D-594 보충으로 답함"이라 서로 맞는다).
  - 조정자가 짚은 겹침 `world/battleBodies.ts battleStart`·`governance/coupWorldBattle.ts bodyOf`: return-home은 이 두 파일을 건드리지 않아(줄기 diff) 겹침 없음 — fixes-1117j의 kin 그대로.
    `world/battleStart.ts`(return-home `unitHome` 잇기)는 fixes-1117j가 건드리지 않았다. 나머지는 저절로 합쳐졌고 타입 검사·시험 통과(아래).
- 기획 미러 동기화(`docs/design/README.md` 절차): AntiGravt01 `claude/sweet-wright-4ubb2u` 5d78b7a → **989a9f2**, `docs/GDD_v4/`를 통째로 복사(README 빼고).
  바뀐 파일 셋(`00_README.md`·`02_Decision_Log.md`·`03_Planning_Rules.md`), 새 결정 **D-593**(연맹 친목·운영자 순간이동 남김·기본 NPC 국가 강하게·같은 가문 공격 불가 — 1117j d593·이 묶음 fixes-1117j가 구현)과
  **D-594** + 보충 넷(적색 부상 = 전투 패배, 강제 귀환은 적색만, 순간이동, 귀환지 넷째 = 적대 아닌 근처 도시 — 이 묶음 return-home이 구현). return-home 기록이 인용한 보충 원문과 미러 글이 같다(Verified: 읽어 맞춤).
  `49_Settings.md` 바뀜 없음 → `settings:cells` 다시 만들 것 없음(`--check` 통과).
  `pnpm check:wiki --stale`(보고만): 26줄, 모두 앞 묶음부터 있던 옛 "대체" 인용. D-594가 D-351을 바꿨지만 결정 로그 D-351에 "대체" 표시가 없어 `cyborg.md`(D-351 인용)는 걸리지 않았다 — 위키 손볼 후보로 남김.

## 판 번호 다시 매김
| 무엇 | main | 줄기 판 | 묶음 판 |
|---|---|---|---|
| 프로토콜 | 68(최소 67) | 둘 다 그대로 | **68(최소 67)** 그대로 |
| 팩 core | 149 | return-home 그대로, fixes-1117j 198 | **150** |
| SIM_VERSION | 76 | return-home 그대로, fixes-1117j 126 | **77** |

- 팩: `manifest.json` 150. 설정 칸 셋 더하기·값 하나·설명 둘 바꿈(지운 ID 없음 → `id-changes.json` 그대로). main의 요리 팩(149)과 겹치는 파일 없음(tuning ↔ items·effects·recipes).
- SIM: `packages/sim/src/version.ts` 77 항목(fixes-1117j 줄기 판 126 글을 옮김) + `SIM_VERSION = 77`. 계수표 기본값은 줄기가 팩 값과 같게 맞췄고(`START_GOVERNANCE`·`START_BUSINESS`), 합친 트리에서 시험 통과(아래).
- ADR 판 줄: 묶음 판 + 대괄호에 줄기 판(`business-ledger.md`·`governance.md` "core@150 [줄기 판 198]", `world-layout.md` "SIM **77** — 묶음 1117k [줄기 판 126]", `governance.md` kin 절 "77 — 묶음 1117k [줄기 판 126]").
  줄기 작업 기록·질문 파일은 줄기 판 그대로.

## 마이그레이션
- 새 마이그레이션 하나, 고치지 않고 그대로 합쳤다: `20261122084301_npc_lost_cities`(fixes-1117j, 스냅숏 `8c414816-db08-43d6-91e0-171a93d148b2`, prevIds = `6692c0a0-…` 하나 — Verified: snapshot.json) —
  새 표 `npc_lost_cities`만(직전 판 앱은 모른 채 돈다). main·return-home은 마이그레이션 없음 → 갈래 없음.
- `db:generate` = "No schema changes"(Verified, 합친 트리).
- 다음 마이그레이션 `prevIds` = 끝 하나: **8c414816-db08-43d6-91e0-171a93d148b2**.

## 질문 번호
- 2751~2755(return-home), 2761~2765(fixes-1117j) — main(2745까지)·서로와 겹치지 않아 옮기지 않았다.

## 리셋 필요 여부: 필요 없음
- 마이그레이션은 표 더하기만. 배포 뒤: 전투에서 빨강 부상으로 진 유닛(사이보그 본체·휴먼·NPC 포함)은 끝나는 순간 돌아갈 곳으로 옮겨지고, 1117j의 "진 사이보그 본체가 걸어서 사는 곳으로"는 없어진다.
  빨강이 아닌 진 유닛은 그 자리에 남는다(전에는 안전 도시로 걸었다). 포로는 그대로 걷는다.
  NPC 나라 숙소가 1분마다 집세를 정해 세를 놓는다(`npc_landlord_mode` 1). 도시 직무 NPC 일꾼도 일하는 때 작업 부상을 굴린다. 고정 세력은 빼앗긴 도시를 표에 기억한다.
  쿠데타는 여전히 꺼짐(`gov_coup_enabled` 0) — NPC 가문 쿠데타 바뀜은 켜야 돈다.

## 바꾼 파일과 이유 (합치며 바꾼 것)
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json` | 충돌 풀기, 팩 core@150 |
| `packages/sim/src/version.ts` | SIM 77 |
| `docs/adr/2026-11-08-injury.md`·`2026-11-21-governance.md`, `docs/questions/2026-11-22-fixes-1117i.md` | 충돌 풀기(절·줄 모두), 판 줄 |
| `docs/adr/2026-11-07-world-layout.md`·`2026-11-15-business-ledger.md` | 판 줄 |
| `docs/design/*`(README 빼고 셋), `docs/design/README.md` | 미러 989a9f2, 원본 커밋·동기화 시각 |
| `docs/worklog/2026/11/22-1515-batch-1117j-merge.md` | "## 배포 (Verified)" 덧붙임(조정자 배포 확인 메모) |
| `docs/worklog/2026/11/22-1407-batch-1117i-merge.md` | 1117j 때 함께 붙은 메모 머리 줄("— 대상 기록: …")이 제목 아래 한 번 더 남아 있어 지움 |
| `docs/worklog/2026/11/22-1750-batch-1117k-merge.md`, `docs/WORKLOG.md` | 이 기록·목차 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 69(최소 68), 팩 151, SIM 78. 다음 마이그레이션 `prevIds` = `8c414816-…` 하나.
- 두 줄기 기록의 "함께 바꿔야 하는 파일" 그대로(fixes-1117j `npc/runtime.ts` 잃은 도시 기억 세 줄). 위키 `cyborg.md`의 D-351(즉시 귀환) 글은 D-594로 바뀐 내용 — 위키를 손볼 때 고친다.
- 1117j의 남은 일 그대로.

## 건드리지 말 것
- 마이그레이션 `20261122084301_npc_lost_cities`(이제 올라간다 — 고치지 않는다).
- 포로 규칙(D-381 걷기), 수호신, 부상 굴림·단계표(D-521) — return-home 기록. 시뮬레이터는 kin을 넣지 않는다, 계수표 기본값 = 팩 값(`combatCatalog.test.ts`) — fixes-1117j 기록.
- 기획 미러 글(원본에서만 고친다).

## 검사 (Verified)
- 처음 묶음(334f0cc429 + return-home + 미러, 푸시 전)의 전체 `pnpm check`도 통과했다(시험 파일 907/907·시험 6,480/6,480) — 버린 트리라 참고만.
- **최종 트리 전체 `pnpm check`**(TEST_DATABASE_URL, DB 시험 포함, 잠금 안 — main d375e07 + 두 줄기 + 판 다시 매김 + 미러, 기록 커밋 전 — 문서만 다름) **한 번에 통과**: 포맷(3,438파일)·린트·타입·모듈 경계·
  파일 크기·다국어(9,060키)·디자인 값(746쌍)·콘텐츠(core@150 46931624ad72), 시험 파일 **911/911**, 시험 **6,495/6,495**(`@terra/sim` 골든 포함 — SIM 77, 511초).
- `pnpm check:content origin/main`(호환 포함, core@150 46931624ad72, 단계 1·2·4a·4b 기준 d375e07), `pnpm settings:cells --check`, `pnpm wiki:index --check`(항목 40개), `pnpm check:wiki --stale`(보고만, 위),
  `pnpm docs:index --check`·`pnpm check:docs`(기록 커밋 뒤), `db:generate` "No schema changes" 통과.
- 이 묶음은 main 대비 `apps/game`·`e2e`를 바꾸지 않아(Verified: `git diff origin/main` 비어 있음) 빌드·`check:bundle`·화면 시험은 돌리지 않았다. main의 `d375e07de9`가 바꾼 개발 화면은 그 커밋 쪽 몫.

## 미검증·알려진 문제
- return-home: 서버가 꺼진 동안 끝난 전투의 NPC 휴먼 귀환지(질문 2754), 순간이동한 NPC 휴먼의 집·일터는 런타임이 맞출 때까지 옛 값일 수 있음(Assumed, 미실행).
- fixes-1117j: NPC 쿠데타 빈도·NPC 집세 세입자·도시 직무 작업 부상 빈도·잃은 도시 되찾기는 운영에서 재지 않았다(Unknown). kin은 엔진 단위 시험·쿠데타 시작 자료 DB 시험만(실제 쿠데타 전투 미실행).
- 운영에서 빨강 귀환이 일어나는지 재지 않았다(Unknown — 배포 뒤 전투가 있을 때 확인). 운영 DB의 마이그레이션은 배포 때 확인.

## 사용자 결정 대기
- 질문 2751~2755, 2761~2765, 그리고 앞 기록의 남은 대기(2711~2715, 2721~2725, 2731~2735, 2741~2745, 2651~2659, 2661~2668, 2671~2678, 2681~2685, 2691~2702 …).

## 배포 (Verified)

- CI `ci` 399 성공(main `2136e8f5b4`, 09:50~09:53 UTC). 앱 컨테이너 09:53:09 UTC 시작, 이미지 `sha-2136e8f5b402`, 팩 core@150(nas-metrics 101, 10:18 UTC, 창 27분, 재시작 뒤 약 25분).
- 마이그레이션 오류 줄 없음, dbFailures 0. 적용 줄은 로그 범위 밖(Unknown).
- RSS 594.1~619.5MB(마지막 10분 약 1MB 변화로 평평), 루프 p99 1.0~1.6ms(첫 분 6.1), DB 커밋 최대 218~621ms, 기기 오류 0, pathFailed 0.
- NPC 판단 2회: npcDecideMs 177.2·109.7 → 같은 분 루프 최대 225.9·133.9ms(앞 배포들보다 낮음, 표본 2회). npcWorkInjuries 2(10:00 — 새 작업 부상이 실제로 돎). 휴먼 2,260 → 2,263, 세력 16, 도시 49, 건물 1,107.
