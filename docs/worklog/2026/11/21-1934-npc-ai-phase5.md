# NPC 자율행동 · AI 5단계 완료(외교 호감 · 자동 의뢰 · 1차맵 임무 · 180일/1만 유닛 검증 · 전체 회귀 통과)

- 일시: 2026-11-21 19:34 (KST)
- 작업 도구: Antigravity
- 관련: `docs/adr/2026-11-20-npc-autonomous-ai.md`, `docs/worklog/2026/11/21-1930-npc-ai-phase4.md`

## 한 일
- **외교 호감도 · 자동 의뢰(D-336) · 1차맵 NPC 상단/원정 계획 (`packages/sim/src/npc/diplomacyAi.ts`)**:
  - `assessDiplomacy`: 두 세력의 7축 실효 성향(`openness`, `belligerence`, `greed`, `communalism`), 정권 체제 궁합(`dictatorship`/`democracy`/`capitalism`), 교역·신뢰·악감정·공동의 적·전쟁 여부를 종합해 호감도(`-1000..+1000`)와 태도(`ally`, `trade_partner`, `neutral`, `rival`, `hostile`)를 요인 분해와 함께 결정적으로 판정한다.
  - `generateNpcQuests`: D-336 NPC 자동 의뢰(`supply_food`, `war_bounty`, `restore_ruin`, `escort_caravan`, `research_data`, `patrol_border`)를 수요·긴급도 우선순위로 발행하고 성향에 따라 보상 배율(`700~1400‰`)을 조절한다.
  - `planPrimaryMapMission`: 생필품 충족도와 `effectiveReservePm` 안전 문턱을 지키는 범위에서 7축 성향에 따라 1차맵 NPC 상단(`caravan`)·원정대(`expedition`)·습격대(`raid`) 파견 여부와 호위 유닛 수를 결정적으로 산출한다.
  - `@terra/sim/npcAi`(`aiIndex.ts`)에서 모두 내보내기했다.
- **180일 장기 진화 · 1만 유닛 성능 예산 검증 (`packages/sim/src/npc/aiScale.test.ts`)**:
  - 6개국(독재 2 · 민주 2 · 자본 2) 180일(6시간 주기 720 사이클) 세대 교체(30일마다 지도자·가문 교체) + 7축 합성 + 외교 + 행동 판단 + 의뢰 + 1차맵 임무 시뮬레이션이 두 번 실행 시 바이트 단위로 완전히 같고 모든 축이 `0~1000` 유효 범위를 지킴을 확인했다.
  - 100명 다양한 직군(시민·일꾼·경비대) 24시간 일과 시뮬레이션의 근무·휴식·순찰 분포 일관성을 확인했다.
  - 10,000명 유닛의 7축 생성 + 8상태 FSM 판단 + 충성도 개입 계산 1회 일괄 실행이 500ms 미만(`Date.now()` 기준 실측 통과)으로 ADR 27 성능 예산 안에 들어옴을 확인했다.
- **전체 회귀 검증(Verified)**:
  - `packages/shared` + `packages/sim` 전체 및 서버·에디터 NPC AI 단위 시험 **198개 파일 1,641건 전부 통과**(10.35초).
  - `pnpm typecheck`, `pnpm lint`(0 경고 0 오류, 2,932개 파일), `pnpm check:boundaries`, `pnpm check:size`, `pnpm check:i18n`, `pnpm check:contrast`, `pnpm check:content --no-compat`, `pnpm check:docs` 모두 통과.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/npc/diplomacyAi.ts`, `diplomacyAi.test.ts` | 7축 외교 호감도·D-336 자동 의뢰·1차맵 상단/원정/습격 계획 및 단위 시험 |
| `packages/sim/src/npc/aiScale.test.ts` | 180일 세대 교체 결정성·100명 24시간 일과 분포·10,000명 유닛 성능 예산 시험 |
| `packages/sim/src/npc/aiIndex.ts` | `diplomacyAi.ts`를 `@terra/sim/npcAi`에서 내보내기 |

## 함께 바꿔야 하는 파일
- 없음(1~5단계 계획된 모듈 구현과 검증을 모두 완료).

## 건드리지 말 것
- 작업 트리의 미커밋 `exp_table` 작업 및 `docs/design/` 미러는 건드리지 않는다.
- 이미 생성된 `apps/server/drizzle/20261121104017_npc_unit_traits/` 마이그레이션 파일은 고치지 않는다.

## 미검증·TODO·알려진 문제
- 실제 PostgreSQL 컨테이너 기반 DB 통합 시험(`*.db.test.ts`), Playwright E2E(`e2e/dev.spec.ts`), 실제 NAS 운영 환경 장시간 루프 p99 실측은 미실행.
- 기획서 정본(`docs/design/`)은 기획 세션 소관이므로, 7축 성향(`D-327`)과 충성도 개입(`D-5040`) 변경 사항을 기획 세션에 전달해 정본과 맞출 필요가 있다.

## 사용자 결정 대기
- 작업 트리에 다른 작업(`exp_table`)과 함께 변경이 쌓여 있으므로, NPC AI 1~5단계 변경분만 선별 커밋·푸시할지 또는 라이브 서버/DB에서 먼저 확인해 볼지 결정 대기.
