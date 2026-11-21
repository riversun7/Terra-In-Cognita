# NPC 자율행동·인공지능 통합 설계 재검토 및 공식 ADR 작성

- 일시: 2026-11-20 20:40 (KST)
- 작업 도구: Antigravity
- 관련: `docs/adr/2026-11-20-npc-autonomous-ai.md`, `docs/adr/2026-11-01-npc-brain-r5.md`, `docs/adr/2026-11-10-editor-input-controls.md`, `docs/adr/2026-11-15-combat-moves.md`

## 한 일
- 기존 코드의 NPC 성향(`traits`, `leaderPm`, `aiTactics`) 참조 전체를 전수 조사해 편중·미사용 실태(`commerce` 13곳 편중, `station` 0곳 미사용)와 실제 작동 방식 4가지(점수·선형·문턱·기회 1회 확률)를 확인했다(**Verified**).
- 사용자 재검토 피드백을 반영해 다른 작업자도 볼 수 있는 공식 설계 제안 ADR(`docs/adr/2026-11-20-npc-autonomous-ai.md`, 상태: `제안`)을 작성했다:
  - 기존 4축을 무손실·양극 7축(`belligerence`·`greed`·`boldness`·`communalism`·`autonomy`·`openness`·`discipline`)으로 재정비하고 콘텐츠별 2~3축 분산 매트릭스를 정의했다.
  - 안 C를 발전시켜 축별 차등 체제 합성(결단 축 vs 문화·여론 축)과 충성도(=만족도, `D-253`) 연동 명령 반영률 공식을 설계했다.
  - 매순간 확률 굴림을 금지하고 사건·기회 기반 4방식(점수·선형·최소 체류 예약 FSM·기회 1회 확률)으로 역할을 나눴다.
  - 수치와 구간(`min~max`)·합성 비율·충성도 곡선을 함께 조작하고 실시간 점수표를 검증하는 `/dev/npc-ai` 에디터와 5단계 로드맵을 정리했다.
- 기획 미러 보호 규칙(`docs/PROTECTED.md`)에 어긋나게 `docs/design/`에 놓여 있던 미추적 초안 파일(`docs/design/npc_ai_design_plan.md`)을 삭제하고 공식 ADR·작업 기록으로 옮겼다.
- `pnpm docs:index`로 `docs/WORKLOG.md` 목차를 갱신했다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `docs/adr/2026-11-20-npc-autonomous-ai.md` | 모든 작업자·에이전트가 참조할 수 있는 공식 양식 설계 제안 ADR 신규 작성 |
| `docs/worklog/2026/11/20-2040-npc-ai-design-plan.md` | 설계 재검토 작업 기록 추가 |
| `docs/WORKLOG.md` | `pnpm docs:index` 자동 갱신 |
| `docs/design/npc_ai_design_plan.md` (삭제) | `docs/design/`은 기획 미러 전용 보호 구역(`docs/PROTECTED.md`)이라 미추적 초안 제거 |

## 함께 바꿔야 하는 파일
- 설계 확정(사용자 승인) 후 1단계 구현 시: `packages/shared/src/unitTraits.ts`(신설), `packages/sim/src/npc/`(7축·합성·충성도 공식, `SIM_VERSION` 올림), `apps/server/src/db/` 마이그레이션, `content/core/tuning.json`, 기획 세션 질문 목록(`docs/PLAN.md` 14장 / `docs/questions/`).

## 건드리지 말 것
- `docs/design/` 기획 미러 원본 파일들 (`docs/PROTECTED.md` 보호 대상).
- 현재 작업 트리에 별도 진행 중인 경험치 테이블·건물 재료 변경 파일들(`exp_table` 관련).

## 미검증·TODO·알려진 문제
- 이번 작업은 설계·문서화 단계라 코드 변경·테스트 실행은 하지 않았다(미실행).
- `node scripts/build-worklog-index.mjs --check`로 목차 일치를 확인했다.

## 사용자 결정 대기
- `docs/adr/2026-11-20-npc-autonomous-ai.md`의 7축 양극 구성과 콘텐츠 분산 매트릭스 확정 여부.
- 플레이어 유닛 충성도 개입 곡선 출발값(충성도 80 이상 거의 0% vs 충성도 50 이상 100% 순종).
- ADR을 `확정`으로 올리고 1단계 구현을 시작할지 여부.
