# 2026-11-22 npc-diplo — NPC 선전포고·강화·참전 답에 호감·신뢰, 호감이 오르는 길

- 일시: 2026-11-22 14:45 (KST)
- 작업 도구: Claude Code
- 관련: 기획 검토(코디네이터 전달 — 질문 2662·2663), 기획 D-255("관계 점수: 호감·신뢰. NPC의 판단과 화면 표시에 쓴다", "NPC 외교 AI는 점수로 판단한다(P0)")·D-290·D-291·D-592.
  ADR `docs/adr/2026-11-21-diplomacy-treaties.md`·`2026-11-01-npc-brain-r5.md` "바뀜 (npc-diplo)". 질문 표시 `docs/questions/2026-11-22-gov-fix-4.md`(2662·2663), 새 질문 `docs/questions/2026-11-22-npc-diplo.md`(2721~2725).
- 가지 `work/npc-diplo`, 바탕 main 801e782fab(묶음 1117h)

## 한 일
1. **2663 — NPC 판단에 호감·신뢰** — 끝남. 시뮬·서버가 같이 쓰는 순수 함수 `packages/sim/src/npc/relationScore.ts`(몫 = 호감 × 가중 ÷ 100 + 신뢰 × 가중 ÷ 100, 정수):
   - 새 선포(`npc/brain.ts attackScore` — 전쟁 중이 아닌 상대, 반란 소탕 제외): 몫을 뺀다 → 호감·신뢰가 낮은 나라를 더 친다(치기 상대 고르기도 바뀜).
   - 강화(`brain.ts peaceBase` — 제안·받기 같은 식): 몫을 더한다. 받는 쪽 `peaceScore`를 NPC끼리 강화·의결 강화 안건(`governance/portLeader.ts`)·휴전 조약 답이 모두 쓴다.
   - 참전 답(`diplomacy/clauses.ts npcJoinsWar` → `npcJoinsWarScored`): 힘 비 문턱 = 1000‰ − 몫(요청한 나라와의 호감·그 나라 신뢰). 중립이면 옛 규칙 그대로.
   - 값 전달: 새 선택 고리 `SimHooks.relationOf` → `RivalView.affinity·trust`(`simulator/npcRun.ts rivalView` 한 줄). 서버 `diplomacy/breaches.ts withTreatyHooks`가 얹는다(`relationOfOwners` — 호감 장부 `getByOwner`,
     위반 장부 새 `trust(owner)`). 판단 분해표(`effectiveTraits.ts explainActions7`)에도 같은 몫(`relation`).
   - 설정 칸 여섯 `npc_relation_{war,peace}_{affinity,trust}`(150·100·150·100 점)·`npc_relation_join_{affinity,trust}_pm`(500·300‰) [임시 2721]. NPC 판단 편집기 "전쟁 · 강화 · 반란" 묶음에 넣음.
   - 시뮬은 호감·신뢰를 들지 않는다 → 중립(0) → 몫 0, 판정 그대로(아래 시뮬 표, 질문 2725).
2. **2662 — 오르는 길** — 끝남. 신뢰는 위반 잊기(`dip_breach_expire_ms` 90일, fixes-d592)로 돌아옴을 확인(코드 읽기·`breaches.test.ts`). 호감(`diplomacy/affinityRise.ts`, 장부 `affinity.ts`):
   하루(UTC 0시)마다 0 쪽으로 1(`dip_affinity_drift_per_day`), 지킨 불가침·동맹·보호 조약 쌍은 그날 대신 +1(`dip_treaty_kept_affinity`), 강화(두 나라 전쟁이 끝남 — 외교 틱이 지난 틱과 견줌) +10
   (`dip_peace_affinity`), 참전 요청 수락(사람·NPC) +10(`dip_join_accept_affinity`) — 모두 [임시 2722]. 켤 때 마지막 하루 걸음 날 = 표의 가장 최근 `updated_at_ms`(마이그레이션 없음), 밀린 날은 7날까지.

## 시뮬 앞뒤 (Verified — 실행, war16 × 30일, 바탕 801e782fab / 이 가지)
| 시드 | 선포 | 강화 조약 | 백지 강화 | 강화 시도·거절 | 도시 빼앗김(약탈+귀속+점령) | 참전 | 출력 |
|---|---|---|---|---|---|---|---|
| 1 | 108 → 108 | 5 → 5 | 7 → 7 | 475·470 → 같음 | 302 → 302 | 시뮬에 없음 | 같음 |
| 2 | 124 → 124 | 1 → 1 | 24 → 24 | 746·745 → 같음 | 519 → 519 | 시뮬에 없음 | 같음 |
| 3 | 38 → 38 | 0 → 0 | 15 → 15 | 463·463 → 같음 | 96 → 96 | 시뮬에 없음 | 같음 |

출력 줄(jsonl)은 머리·요약 줄의 `content`(팩 판·해시 core@146 → core@196) 말고 모두 같다(그래서 `linesHash`만 870fcbe9 → 6919b0b4 등으로 바뀜). SIM_VERSION 그대로 75.

## 판·마이그레이션·리셋
- 줄기 판(묶을 때 다시 매긴다): 팩 **core@196**(설정 칸 열 — `npc_relation_*` 여섯, `dip_affinity_drift_per_day`·`dip_treaty_kept_affinity`·`dip_peace_affinity`·`dip_join_accept_affinity`).
  프로토콜 그대로, SIM_VERSION 그대로(75), 마이그레이션 없음, 리셋 필요 없음.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/npc/relationScore.ts`(새, +시험)·`brain.ts`·`effectiveTraits.ts`·`coefficients.ts`·`aiIndex.ts`, `packages/sim/src/simulator/npcRun.ts` | 관계 몫·고리 `relationOf`·계수 |
| `packages/sim/src/tuningNpc.ts`·`tuningGovernance.ts`·`society/governanceCoefficients.ts`, `apps/server/src/governance/rules.ts`·`tuning/scope.ts`, `content/core/tuning.json`·`manifest.json`, `apps/game/src/editor/npcAi/npcAiModel.ts` | 설정 칸 열, core@196, 편집기 묶음 |
| `apps/server/src/diplomacy/affinityRise.ts`(새)·`affinity.ts`(+시험)·`breaches.ts`(+시험)·`clauses.ts`(+시험)·`service.ts`·`store.ts`, `diplomacy.db.test.ts` | 오르는 길·참전 답·고리·켤 때 시각 |
| ADR 둘·질문 둘·이 기록 | 문서 |

## 함께 바꿔야 하는 파일
- 묶을 때: 팩 core@196 → 묶음 판(`content/core/manifest.json`). 질문 번호 2721~2725가 겹치면 옮긴다(질문 파일·ADR·`tuning.json` source·`coefficients.ts`·`relationScore.ts` 주석).
- d593 줄기(같은 집 공격 막기·강한 시작 국가)가 `brain.ts attackScore`를 고치면 한 줄(`+ warRelationOffset(r, c)`)만 겹친다 — 둘 다 남긴다.
- 2721 답이 나면 `relationScore.ts`(모양)·설정 칸 값. 2723 답이 나면 `clauses.ts npcTreatyAnswer`에 신뢰 문턱.

## 건드리지 말 것
- 시뮬 판정: 고리 `relationOf`는 서버만 붙인다. 시뮬에 붙이면 판정이 바뀐다(SIM_VERSION 올림 + 골든).
- 호감 표 `diplomacy_affinity`의 `updated_at_ms`는 이제 하루 걸음 날을 정한다 — 다른 곳에서 옛 시각으로 덮어쓰지 않는다.

## 검사
- 작업 중(Verified — 실행): sim·server 타입 검사, oxlint(바꾼 폴더), sim 단위 `relationScore`(7)·`brain`·`effectiveTraits`·`tuning*` 78/78, 서버 단위 `diplomacy/` 셋 + `tuning/state` 44/44,
  DB(TEST_DATABASE_URL) `diplomacy.db.test.ts` 3/3·`governance5.db.test.ts`·`npc/warOutcomes.db.test.ts` 7/7, `pnpm check:content --no-compat`(core@196 0a61dd0b57b1), `pnpm settings:cells --check`.
- 끝 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안 — Verified 실행): 첫 판은 `breaches.test.ts` 새 시험의 가짜 고리 `{}`가 `SimHooks` 필수 칸이 없어 TS2739로 멈춰 고쳤다.
  둘째 판 **통과**: 포맷(3,405파일)·타입·린트·경계·크기·다국어(9,004키)·디자인 값(746쌍)·콘텐츠(core@196 0a61dd0b57b1), 시험 파일 **900/900**·시험 **6,433/6,433**(`@terra/sim` 골든 포함 — SIM_VERSION 그대로).
  그 밖에 `pnpm docs:index`·`pnpm check:docs`·`pnpm wiki:index --check` 통과.
- 화면 시험·빌드: 미실행(화면은 편집기 묶음 목록에 칸 ID 여섯만 더함 — 디스크).

## 미검증·TODO·알려진 문제
- 서버 실제 세계에서 NPC 판단이 호감으로 다른 상대를 고르는 것은 단위 시험(판단 점수)·고리 시험으로만 봤다(운영 세계 관찰 없음).
- 강화 몫은 서버가 꺼진 동안 끝난 전쟁·한 틱(1분) 안에 끝났다 다시 난 전쟁을 놓친다(질문 2724).
- 하루 걸음 따라잡기는 7날까지 — 그보다 오래 꺼져 있으면 나머지 날은 걷지 않는다.

## 사용자 결정 대기
- `docs/questions/2026-11-22-npc-diplo.md` 2721~2725. 앞 줄기들의 남은 질문 그대로.
