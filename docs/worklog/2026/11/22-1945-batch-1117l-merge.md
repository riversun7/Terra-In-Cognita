# 2026-11-22 묶음 1117l 합치기 (1117k 기획 검토 고침 / 기획 미러 1955bd7(D-351 대체 표시)) — 리셋 필요 없음

- 일시: 2026-11-22 19:45~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `22-1930-fixes-1117k`, 질문 `docs/questions/2026-11-22-fixes-1117k.md`(2771~2775),
  ADR `2026-11-15-unloaded-second-maps.md`·`2026-11-21-governance.md`·`2026-11-15-business-ledger.md`·`2026-11-07-world-layout.md` "바뀜 (fixes-1117k)",
  기획 D-255·D-351·D-555·D-569·D-591·D-593·D-594

## 한 일
- main **2136e8f5b4**(묶음 1117k) 위에 `work/fixes-1117k`(539c4fe224, 바탕 2136e8f5b4 — main이 움직이지 않음)를 `--no-ff`로 합쳤다(기본 메시지, 충돌 없음).
  판 다시 매김(아래)은 합치기 커밋에 얹었다(`--amend`, 부모 그대로).
  - 띄우지 않은 2차맵으로의 귀환도 차례대로(`world/unitHome.ts`·`unitHomeWorld.ts`, 새 `TravelService.parkAt` — 플레이어 유닛은 좌표 유닛으로, NPC 유닛은 2차맵을 띄운 뒤).
  - 서버가 꺼진 동안 끝난 전투 결과는 NPC 사회 런타임이 켜진 뒤 적용(`world/battles.ts holdResults`). `world/world.ts`에서 `releaseBattles()`가 `travel.restoreNpc` 뒤에 있음을 확인했다(Verified: 읽음, 918·919줄).
  - 쿠데타 힘 = 도착한 병력, NPC 가문도 같게(`governance/coup.ts`, 모자라면 먼저 모으기).
  - NPC 숙소 층 올리기(새 `residence/npcFloors.ts`, 건물 서비스 `npcJob` 새 종류 `floor`, 설정 칸 `npc_floor_mode`·`npc_floor_demand_pm`).
  - 잃은 도시 기억을 모든 잃는 길로(`@terra/sim simulator/world.ts transferCity`).
  - 유닛 소속 도시 = 그 유닛 가문의 도시(`world/houseTies.ts cityOfHouse`).
  - 위키 `docs/wiki/pages/cyborg.md`: D-351(즉시 귀환) → D-594.
- 기획 미러 동기화(`docs/design/README.md` 절차): AntiGravt01 `claude/sweet-wright-4ubb2u` 989a9f2 → **1955bd7**, `docs/GDD_v4/`를 통째로 복사(README 빼고).
  바뀐 파일은 `02_Decision_Log.md` 한 줄 — D-351 아래 "→ D-594" 줄의 "바뀜"이 "대체됨 (D-594로 대체)"가 됐다. 새 결정 없음(D-001~D-594 그대로). 지운 파일 없음.
  `49_Settings.md` 바뀜 없음 → `settings:cells` 다시 만들 것 없음(`--check` 통과).
  `pnpm check:wiki --stale`(보고만): 26줄, 모두 앞 묶음부터 있던 옛 "대체" 인용. 이번에 D-351에 대체 표시가 붙었지만 이 묶음에서 `cyborg.md`가 D-351을 빼고 D-594로 바꿨으므로 걸리지 않는다(Verified: 출력에 D-351 없음).
  1117k 기록이 남긴 "위키 손볼 후보 `cyborg.md`"는 이것으로 닫힌다.

## 판 번호 다시 매김
| 무엇 | main | 줄기 판 | 묶음 판 |
|---|---|---|---|
| 프로토콜 | 68(최소 67) | 그대로 | **68(최소 67)** 그대로 |
| 팩 core | 150 | 190 | **151** |
| SIM_VERSION | 77 | 117 | **78** |

- 팩: `manifest.json` 151. 설정 칸 둘 더하기만(지운 ID 없음 → `id-changes.json` 그대로).
- SIM: `packages/sim/src/version.ts` 78 항목(줄기 판 117 글을 옮김) + `SIM_VERSION = 78`. 골든 파일은 줄기가 바꾸지 않았다(war16 등 시나리오 출력만 바뀜 — 줄기 기록의 시뮬 전·후 표). 합친 트리에서 시험 통과(아래).
- ADR 판 줄: `world-layout.md` "SIM_VERSION 78(묶음 1117l [줄기 판 117])", `business-ledger.md` "core@151 — 묶음 1117l [줄기 판 190]". 줄기 작업 기록·질문 파일은 줄기 판 그대로.

## 마이그레이션
- 없음. `db:generate` = "No schema changes"(Verified, 합친 트리). 다음 마이그레이션 `prevIds` = 끝 하나 **8c414816-db08-43d6-91e0-171a93d148b2** 그대로.

## 질문 번호
- 2771~2775(fixes-1117k) — main(2765까지)과 겹치지 않아 옮기지 않았다.

## 리셋 필요 여부: 필요 없음
- 마이그레이션 없음, 팩은 설정 칸 더하기만. 배포 뒤: NPC 나라가 정원이 찬 숙소의 층을 1분 훑기마다 투자 굴림으로 올린다(`npc_floor_mode` 1). 기본 NPC 국가는 반란·독립·쿠데타로 잃은 도시도 기억해 되찾으러 간다.
  빨간 부상 귀환지가 띄우지 않은 2차맵이어도 그 차례를 지킨다. 서버를 다시 켤 때 꺼진 동안 끝난 전투 결과는 NPC 런타임이 켜진 뒤 적용된다. 쿠데타는 여전히 꺼짐(`gov_coup_enabled` 0).

## 바꾼 파일과 이유 (합치며 바꾼 것)
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json` | 팩 core@151 |
| `packages/sim/src/version.ts` | SIM 78 |
| `docs/adr/2026-11-07-world-layout.md`·`2026-11-15-business-ledger.md` | 판 줄 |
| `docs/design/02_Decision_Log.md`, `docs/design/README.md` | 미러 1955bd7, 원본 커밋·동기화 시각 |
| `docs/worklog/2026/11/22-1750-batch-1117k-merge.md` | "## 배포 (Verified)" 덧붙임(조정자 배포 확인 메모) |
| `docs/worklog/2026/11/22-1945-batch-1117l-merge.md`, `docs/WORKLOG.md` | 이 기록·목차 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 69(최소 68), 팩 152, SIM 79. 다음 마이그레이션 `prevIds` = `8c414816-…` 하나.
- 줄기 기록의 "함께 바꿔야 하는 파일" 그대로.

## 건드리지 말 것
- `world/world.ts` 부팅 차례: `releaseBattles()`는 `travel.restoreNpc` 뒤(2754 회귀 시험 `returnHome.db.test.ts`).
- 기획 미러 글(원본에서만 고친다). 마이그레이션 `20261122084301_npc_lost_cities`.

## 검사 (Verified)
- **최종 트리 전체 `pnpm check`**(TEST_DATABASE_URL, DB 시험 포함, 잠금 안 — main 2136e8f + fixes-1117k + 판 다시 매김 + 미러, 기록 커밋 전 — 문서만 다름) **한 번에 통과**: 포맷(3,440파일)·린트·타입·모듈 경계·
  파일 크기·다국어(9,060키)·디자인 값(746쌍)·콘텐츠(core@151 eec039d1c6d7), 시험 파일 **912/912**, 시험 **6,503/6,503**(`@terra/sim` 골든 포함 — SIM 78, 589초).
- `pnpm check:content origin/main`(호환 포함, core@151 eec039d1c6d7, 단계 1·2·4a·4b 기준 2136e8f), `pnpm settings:cells --check`, `pnpm wiki:index --check`(항목 40개), `pnpm check:wiki`(항목 40개),
  `pnpm check:wiki --stale`(보고만, 위), `db:generate` "No schema changes", `pnpm docs:index --check`·`pnpm check:docs`(기록 커밋 뒤) 통과.
- 이 묶음은 main 대비 `apps/game`·`e2e`를 바꾸지 않아(Verified: `git diff origin/main` 비어 있음) 빌드·`check:bundle`·화면 시험은 돌리지 않았다.

## 미검증·알려진 문제
- 줄기 기록의 미검증 그대로: NPC 층 올리기 빈도·쿠데타 모으기·띄우지 않은 2차맵 NPC 귀환(비동기)은 운영에서 재지 않았다(Unknown).
- 운영 DB·배포는 푸시 뒤 조정자가 확인.

## 사용자 결정 대기
- 질문 2771~2775, 그리고 앞 기록의 남은 대기(2711~2715, 2721~2725, 2731~2735, 2741~2745, 2651~2659, 2661~2668, 2671~2678, 2681~2685, 2691~2702 …).
