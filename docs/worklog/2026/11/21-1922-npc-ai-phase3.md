# NPC 자율행동 · AI 3단계 구현(유닛 8상태 FSM · NPC 가문 AI · 지도자 순회 · 2차맵 영속화)

- 일시: 2026-11-21 19:22 (KST)
- 작업 도구: Antigravity
- 관련: `docs/adr/2026-11-20-npc-autonomous-ai.md`, `docs/worklog/2026/11/20-2225-npc-ai-phase1-2.md`

## 한 일
- **유닛 8상태 예약 FSM (`packages/sim/src/npc/unitBrain.ts`)**:
  - 8개 일상 상태(`work`, `gather`, `haul`, `rest`, `consume`, `patrol`, `evade`, `travel`)의 유틸리티 점수 + 요인 분해(`scoreUnitStates`), 최소 체류 시간(`dwellDurationMs`) 및 히스테리시스 보너스(진동 방지), 긴급 인터럽트(`haul`·`threatNear evade`), 경비대 순찰 반경(`guardPatrolRadiusCells`), 재평가 주기(`reevalIntervalMs`), 24시간 일과 시뮬레이션(`simulateDailySchedule`)을 순수 결정적 정수 함수로 구현했다.
- **NPC 가문 자율 AI (`packages/sim/src/npc/houseBrain.ts` · `apps/server/src/npc/npcHouseAi.ts`)**:
  - 가문 합성 7축 성향(또는 `traits_override`)으로 `hold`, `vault_return`, `invest_city`, `member_dividend`, `branch_out`, `migrate` 행동 판단(`decideHouseAction`) 및 민주·자본 국가 안건 투표(`decideHouseVote`)를 구현했다.
  - 지배 가문 금고 환류(`apps/server/src/npc/rulingVault.ts`)가 7축 성향이 연결될 때 `npcRulingVaultReturnPm7`을 쓰도록 확장하고, 없으면 기존 `npcRulingVaultReturnPm`을 유지했다.
- **2차맵 영속화 · 8상태 FSM 연결 · 지도자 순회**:
  - `world_units.traits`(길이 7 `smallint[]`)의 읽기·쓰기를 `secondMapRows.ts`, `persist/tables.ts`, `persist/load.ts`, `secondMapTypes.ts`, `secondMap.ts`에 연결했다(`UnitState`를 `secondMapTypes.ts`로 분리해 `secondMap.ts`를 973줄로 유지).
  - `apps/server/src/world/bots.ts`와 `apps/server/src/npc/humanPlaces.ts`에 8상태 FSM(`resolveBotAiState`)과 경비대 순찰 반경(`guardPatrolRadiusCells`)을 연결했다(`npc_ai_unit_enabled = 1` + 개별 7축 성향이 있을 때만 활성화, 기존 시험 100% 하위 호환).
  - `apps/server/src/npc/unitTraitRegistry.ts`(시드 결정적 성향 생성·복원·캐시 정리), `apps/server/src/npc/leaderRoam.ts`(지도자 수도 순회 동기화), `apps/server/src/npc/leaders.ts`(지도자 생성 시 7축 성향 부여), `apps/server/src/npc/aiBridge.ts`(`runtime.ts` 994줄 유지 브리지)를 추가·연결했다.
- **`/dev/npc-ai` 탭 2 24시간 일과 타임라인 추가**:
  - 서버 tRPC `npcAi.previewUnitSchedule`을 추가하고 `NpcAiUnitTab.tsx`에 직군·7축 슬라이더 기반 24시간 8상태 예상 시간표 및 경비대 순찰 반경·지도자 순회 반경 실시간 미리보기를 붙였다.
- **검증(Verified)**:
  - 단위 시험 11개 파일 46건 통과(`unitBrain`, `houseBrain`, `unitTraitRegistry`, `leaderRoam`, `npcHouseAi`, `humanPlaces`, `leaders`, `rulingVault`, `bots`, `secondMapRows`, `trpc/npcAi`).
  - `pnpm typecheck`, `pnpm lint`(0 경고 0 오류, 2,928개 파일), `pnpm check:boundaries`, `pnpm check:size`, `pnpm check:i18n`(8,524키), `pnpm check:contrast`(746쌍), `pnpm --filter @terra/game build`, `node scripts/check-pwa.mjs`, `pnpm check:bundle`(첫 화면 gzip 110,451 B / 상한 131,416 B) 모두 통과.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/npc/unitBrain.ts`, `unitBrain.test.ts` | 8상태 예약 FSM·최소 체류·긴급 인터럽트·순찰 반경·24시간 시뮬 및 시험 |
| `packages/sim/src/npc/houseBrain.ts`, `houseBrain.test.ts` | NPC 가문 자율 행동·국가 안건 투표·주기 계산 및 시험 |
| `packages/sim/src/npc/aiIndex.ts` | `unitBrain`, `houseBrain`을 `@terra/sim/npcAi`에서 내보내기 |
| `apps/server/src/world/secondMapRows.ts`, `secondMapTypes.ts`, `secondMap.ts`, `persist/tables.ts`, `persist/load.ts` | `world_units.traits` 영속화, `setTraits`, 지도자 순회 `setHome` 지원 |
| `apps/server/src/world/bots.ts`, `apps/server/src/npc/humanPlaces.ts` | `BotHome`에 8상태 FSM·경비대 순찰 반경·시장·전쟁 상태 연결 |
| `apps/server/src/npc/unitTraitRegistry.ts`, `unitTraitRegistry.test.ts` | 개별 유닛 7축 성향 결정적 생성·복원·캐시 관리 및 시험 |
| `apps/server/src/npc/leaders.ts`, `leaderRoam.ts`, `leaderRoam.test.ts` | 지도자 7축 성향 생성 및 수도 순회 동기화 |
| `apps/server/src/npc/npcHouseAi.ts`, `npcHouseAi.test.ts`, `rulingVault.ts` | NPC 가문 자율 AI 스케줄러 및 지배 가문 7축 금고 환류 연결 |
| `apps/server/src/npc/aiBridge.ts`, `runtime.ts` | NPC 런타임에 유닛 성향 레지스트리·2차맵 8상태 FSM 브리지 연결(`runtime.ts` 994줄 유지) |
| `apps/server/src/trpc/npcAi.ts`, `npcAi.test.ts` | `npcAi.previewUnitSchedule` tRPC 프로시저 및 시험 추가 |
| `apps/game/src/editor/npcAi/NpcAiUnitTab.tsx`, `NpcAiEditorScreen.tsx`, `npcAiEditor.css`, `messages/{ko,en}.json` | `/dev/npc-ai` 탭 2에 가상 유닛 24시간 8상태 일과 타임라인 미리보기 추가 |

## 함께 바꿔야 하는 파일
- 4단계 진행 시 `packages/sim/src/combat/moveAi.ts` 스텁 완성 및 `apps/server/src/travel/clashDecide.ts`·`encounterSides.ts`에 7축 작전·충성도 개입률을 연결한다.

## 건드리지 말 것
- 작업 트리의 미커밋 `exp_table` 작업 및 `docs/design/` 미러는 건드리지 않는다.
- 이미 생성된 `apps/server/drizzle/20261121104017_npc_unit_traits/` 마이그레이션 파일은 고치지 않는다.

## 미검증·TODO·알려진 문제
- 실제 PostgreSQL 부팅 복구(DB 통합 시험 `*.db.test.ts`) 및 2차맵 라이브 E2E 실행은 미실행.
- 4단계(전투 `moveAi.ts` 완성 · 조우 충성도 연동 작전 · NPC 공성전) 및 5단계(1차맵 상단/원정 · 180일 `D-391` 장기 시뮬 · NAS 부하 검증)는 미착수.

## 사용자 결정 대기
- 이어서 **4단계(전투 이동 AI `moveAi.ts` 완성 · 7축/충성도 조우·전투 작전 연결)**를 바로 진행할지 여부.
