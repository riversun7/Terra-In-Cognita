# PROTECTED

승인(사용자 확인 또는 ADR) 없이 바꾸면 안 되는 파일·시스템과 그 이유.

| 대상 | 규칙 | 이유 |
|---|---|---|
| `docs/DECISION_LOG.md` | 수정 금지(맨 끝에 추가만) | 계획 세션의 질문·답변 원문 기록 |
| `docs/adr/*.md` (확정된 것) | 수정 금지. 바꾸려면 새 ADR + 옛 ADR에 "대체됨" 표시 | 결정 이력 보존 |
| `docs/research/*.md` | 수정 금지 | 당시 기준 조사 원본 |
| `docs/design/` | 이 세션에서 수정 금지 | 기획서는 별도 기획 세션이 관리 |
| `.claude/skills/grill-me/`, `.claude/skills/grilling/` | 수정 금지(갱신은 원본 저장소에서 다시 복사) | 외부 원본(MIT) |

생성되면 추가할 보호 대상(PLAN 10.4):

| 대상 | 규칙 | 이유 |
|---|---|---|
| `packages/protocol/` | 의미 변경 시 ADR + 프로토콜 버전 올림 | 기기·서버 호환성 |
| `packages/sim/` | 판정 규칙 변경 시 ADR + `simVersion` 올림 | 결과 재현·공정성 |
| `packages/planet/` 생성기 | 출력이 바뀌는 변경 시 ADR + `generatorVersion` 올림 | 이미 생성된 세계와의 일치 |
| 원장·거래소 코드 | 변경 시 ADR + 불변 조건 테스트 통과 | 경제 무결성 |
| 적용된 DB 마이그레이션 | 수정 금지, 새 마이그레이션 추가만 | 운영 DB와의 일치 |
