# NPC 자율행동 · AI 4단계 구현(전투 이동 AI `moveAi.ts` 완성 · 7축/충성도 조우 작전 연결 · `/dev/npc-ai` 탭 4 확장)

- 일시: 2026-11-21 19:30 (KST)
- 작업 도구: Antigravity
- 관련: `docs/adr/2026-11-20-npc-autonomous-ai.md`, `docs/adr/2026-11-15-combat-moves.md`, `docs/worklog/2026/11/21-1922-npc-ai-phase3.md`

## 한 일
- **전투 이동 AI `moveAi.ts` 완성(WP-4)**:
  - `packages/sim/src/combat/battleTypes.ts`의 `CombatUnitSpec`에 선택 필드 `aiTactics?: AiTactics`를 추가했다(`aiTactics`가 없는 기존 전투·리플레이·골든 해시는 100% 이전과 동일).
  - `packages/sim/src/combat/moveAi.ts`에 `wantsRun`(퇴각 중 스태미나 ≥ 15%, 공격·추격 슬라이더 + 스태미나 문턱), `moveSkillAllowed`(돌진·도약·점멸 toward/away·뒷걸음·은신·감지를 ① 교전·③ 엄폐·⑤ 스킬 아끼기·HP·거리 기준 기회당 1회 1초 버킷 결정적 굴림으로 판정), `chooseCombatTacticFromTraits`(7축 성향 + 사거리 → D-558 8전개 방식 `assault`·`defend`·`center`·`flank`·`infiltrate`·`focus`·`harass`·`delay` 결정적 매핑)를 구현하고 `battle.ts`와 `@terra/sim/npcAi`에 연결했다.
- **조우 AI 7축 성향 · 충성도 개입률 · 지휘관 비중 연결**:
  - `apps/server/src/travel/encounterSides.ts`의 `SideSources`와 `unitTactics`를 확장해:
    - 플레이어 유닛은 저장한 작전과 7축 성향 본능 작전을 충성도(=만족도, D-253) 기반 `loyaltyOverridePm`으로 합성한다(사이보그 본체·안드로이드·만족도 미집계는 안전하게 `0‰` 순종).
    - NPC 유닛은 7축 성향과 분대 지휘관 성향(`commanderSharePm`)으로 `tacticsFromUnitTraits`를 산출하며, 7축 성향이 없으면 기존 공격 성향 프리셋(`npcPresetOf`)으로 폴백한다.
    - 전투 시작 시 `CombatUnitSpec.aiTactics` 주입을 위한 `sideCombatTactics` 도우미를 추가했다.
- **`/dev/npc-ai` 탭 4 전투·이동 AI 실시간 미리보기 확장**:
  - 서버 tRPC `npcAi.previewCombatMove`를 추가하고, `NpcAiCombatTab.tsx`에 무기 사거리 입력 + D-558 추천 전개 방식 + WP-4 달리기·돌진·뒷걸음·은신 판정 칩을 실시간으로 표시했다.
- **검증(Verified)**:
  - 단위 시험 8개 파일 92건 통과(`moveAi`, `moves`, `battle`, `legionTactics`, `clashDecide`, `encounterSides`, `encounterWorld`, `trpc/npcAi`).
  - `pnpm typecheck`, `pnpm lint`(0 경고 0 오류, 2,929개 파일), `pnpm check:boundaries`, `pnpm check:size`, `pnpm check:i18n`, `pnpm check:contrast`, `pnpm --filter @terra/game build`, `node scripts/check-pwa.mjs`, `pnpm check:bundle`(첫 화면 gzip 110,469 B / 상한 131,416 B) 모두 통과.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/combat/battleTypes.ts` | `CombatUnitSpec`에 선택 `aiTactics` 칸 추가 |
| `packages/sim/src/combat/moveAi.ts`, `moveAi.test.ts` | WP-4 `wantsRun`·`moveSkillAllowed`·`chooseCombatTacticFromTraits` 구현 및 시험 |
| `packages/sim/src/combat/battle.ts` | `wantsRun` 호출에 파티 퇴각 상태(`retreating`) 전달 |
| `packages/sim/src/npc/aiIndex.ts` | `chooseCombatTacticFromTraits`, `wantsRun`, `moveSkillAllowed`를 `@terra/sim/npcAi`에서 내보내기 |
| `apps/server/src/travel/encounterSides.ts`, `encounterSides.test.ts` | 조우 `unitTactics`에 7축 성향·충성도 개입률·지휘관 비중 연결 및 `sideCombatTactics` 추가·시험 |
| `apps/server/src/trpc/npcAi.ts`, `npcAi.test.ts` | `npcAi.previewCombatMove` tRPC 프로시저 및 권한·판정 시험 추가 |
| `apps/game/src/editor/npcAi/NpcAiCombatTab.tsx`, `NpcAiEditorScreen.tsx` | 탭 4에 사거리 입력 + D-558 전개·WP-4 이동 AI 판정 실시간 미리보기 연결 |

## 함께 바꿔야 하는 파일
- 5단계 진행 시 1차맵 NPC 상단/원정(선택), 외교 호감도·의뢰 자동 발행(`D-336`), 180일 `D-391` 장기 시뮬레이션·NAS 부하 검증을 진행한다.

## 건드리지 말 것
- 작업 트리의 미커밋 `exp_table` 작업 및 `docs/design/` 미러는 건드리지 않는다.
- 이미 생성된 `apps/server/drizzle/20261121104017_npc_unit_traits/` 마이그레이션 파일은 고치지 않는다.

## 미검증·TODO·알려진 문제
- 실제 6v6 3D 리플레이 화면과 E2E 테스트 실행은 미실행.
- 5단계(외교 호감·의뢰 발행·180일 `D-391` 장기 시뮬레이션·부하 벤치마크)는 아직 미착수.

## 사용자 결정 대기
- 마지막 **5단계(외교 호감·자동 의뢰·장기 시뮬레이션 검증 및 전체 회귀 점검)**를 바로 이어서 진행할지 여부.
