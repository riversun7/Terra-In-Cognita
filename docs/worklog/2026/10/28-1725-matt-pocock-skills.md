# Matt Pocock 개발 흐름 스킬 추가

- 일시: 2026-10-28 17:25 (KST)
- 작업 도구: Claude Code (클라우드 세션)
- 관련: ADR `2026-10-28-agent-skills-dev-flow.md`, `2026-10-28-agent-skills.md`, AGENTS.md 8장

## 한 일
- mattpocock/skills(@`59db609eb1e1`, MIT)에서 12개를 그대로 복사: codebase-design, diagnosing-bugs, domain-modeling, grill-with-docs, improve-codebase-architecture, prototype, research, tdd, handoff, to-questionnaire, wait-what, writing-for-agents. 각 폴더에 원본 루트 `LICENSE`를 넣었다.
- 이미 있던 grill-me·grilling에 원본의 `agents/` 폴더(다른 도구용 설명 파일)를 더해 원본과 같게 맞췄다(`diff -r` 확인).
- AGENTS.md 8장에 개발 흐름 스킬의 쓰임과 규칙 우선순위(ADR 형식, 용어집, 조사·질문지 위치)를 적었다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `.claude/skills/<12개>/`, `.claude/skills/grill-me/agents`, `.claude/skills/grilling/agents` | 스킬 추가·원본과 맞춤 |
| `AGENTS.md` | 쓰임과 규칙 우선순위 |
| `THIRD_PARTY_NOTICES.md`, `docs/PROTECTED.md` | 출처·라이선스, 수정 금지 |
| `docs/adr/2026-10-28-agent-skills-dev-flow.md`, `docs/PLAN.md` | 결정 기록, ADR 목록 |

## 함께 바꿔야 하는 파일
- 스킬을 더하거나 갱신하면 `THIRD_PARTY_NOTICES.md`, `docs/PROTECTED.md`, AGENTS.md 8장.

## 건드리지 말 것
- 외부 스킬 폴더 안의 파일.

## 확인한 것 (Verified)
- 복사한 스킬이 원본과 같다(`diff -r`, 추가한 `LICENSE` 제외).
- 이 세션에서 모델이 부를 수 있는 7개(codebase-design, diagnosing-bugs, domain-modeling, prototype, research, tdd, writing-for-agents)가 바로 목록에 나타났다. 나머지 5개는 사용자 명령(`/이름`) 전용이라 목록에 없는 것이 정상이다.

## 미검증·TODO·알려진 문제
- 실제 작업에 써 본 적은 아직 없다.

## 사용자 결정 대기
- 없음.
