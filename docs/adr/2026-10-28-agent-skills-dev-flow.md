# 개발 흐름 스킬(Matt Pocock) 추가와 문서 규칙 우선

- 상태: 확정
- 날짜: 2026-10-28
- 관련: `2026-10-28-agent-skills.md`(같은 방식으로 추가), AGENTS.md 8장, `THIRD_PARTY_NOTICES.md`

## 배경
사용자가 요즘 많이 쓰는 Matt Pocock 스킬도 가능하면 넣어 달라고 했다(2026-10-28). 원본 저장소(mattpocock/skills, MIT)에는 스킬 38개가 있다(Verified: `59db609eb1e1`, 2026-10-27). 일부 스킬은 이슈 트래커와 번호식 ADR(`docs/adr/0001-…`)을 전제로 한다(Verified: `domain-modeling/ADR-FORMAT.md`). 이 저장소의 ADR은 날짜-슬러그 형식이다.

## 선택지
1. 38개 전부
2. 이 프로젝트에 맞는 것만 골라 넣고, 충돌하는 규칙은 AGENTS.md로 덮는다
3. 넣지 않는다

## 결정
- 2번. ADR 19와 같은 방식(원본 그대로 복사, 커밋 고정)으로 12개를 넣는다: codebase-design, diagnosing-bugs, domain-modeling, grill-with-docs, improve-codebase-architecture, prototype, research, tdd, handoff, to-questionnaire, wait-what, writing-for-agents. 이미 있던 grill-me·grilling은 같은 커밋으로 맞춘다.
- 넣지 않은 것:
  - code-review: Claude Code 기본 스킬과 이름이 같다.
  - to-spec, to-tickets, triage, wayfinder, implement, implement-spec, setup-matt-pocock-skills, ask-matt: 이슈 트래커 기반 흐름을 전제로 한다. 쓰게 되면 그때 정한다.
  - pr: 트렁크 기반이라 PR을 쓰지 않는다.
  - setup-pre-commit(Husky), setup-ts-deep-modules(dependency-cruiser): 이미 정한 도구(lefthook, 자체 경계 검사)와 충돌한다.
  - git-guardrails-claude-code: 훅 설정을 바꾼다(사용자 승인 사항).
  - migrate-to-shoehorn, scaffold-exercises, retro, teach, wizard, 실험 단계(in-progress) 스킬: 이 프로젝트에 필요 없거나 아직 불안정하다.
- 규칙 충돌은 AGENTS.md 8장이 정한다: ADR은 이 저장소 형식, 용어집은 루트 `GLOSSARY.md`, 조사 결과는 `docs/research/`, 질문지는 `docs/questions/`.

## 이유
- tdd·diagnosing-bugs·codebase-design은 판정 코드(`packages/sim`)와 모듈 경계 작업에 바로 쓸모가 있다.
- grill-with-docs·domain-modeling은 이 저장소의 ADR·용어 기록 습관과 맞는다. 형식만 우리 규칙으로 맞추면 된다.
- wait-what은 "어렵게 말하지 말라"는 사용자 요청에 맞는 되묻기 명령이다.

## 결과
- 스킬이 늘어 지시가 겹칠 수 있다 → AGENTS.md 8장에 언제 무엇을 쓰는지 적었다.
- 스킬이 번호식 ADR을 만들려 하면 AGENTS.md 규칙으로 막는다(문서 규칙이 스킬보다 우선).
