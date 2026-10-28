# PROTECTED

승인(사용자 확인 또는 ADR) 없이 바꾸면 안 되는 파일·시스템과 그 이유.

| 대상 | 규칙 | 이유 |
|---|---|---|
| `docs/DECISION_LOG.md` | 수정 금지(맨 끝에 추가만) | 계획 세션의 질문·답변 원문 기록 |
| `docs/adr/*.md` (확정된 것) | 수정 금지. 바꾸려면 새 ADR + 옛 ADR에 "대체됨" 표시 | 결정 이력 보존 |
| `docs/research/*.md` | 수정 금지 | 당시 기준 조사 원본 |
| `docs/design/` | 이 세션에서 수정 금지 | 기획서는 별도 기획 세션이 관리 |
| `.claude/skills/grill-me/`, `.claude/skills/grilling/` | 수정 금지(갱신은 원본 저장소에서 다시 복사) | 외부 원본(MIT) |
| `.claude/skills/`의 외부 스킬(frontend-design, ui-ux-pro-max, web-design-guidelines, react-best-practices, impeccable, hallmark, taste-skill, Emil Kowalski 스킬 8개, Matt Pocock 스킬 12개) | 수정 금지. 갱신은 원본에서 다시 복사하고 `THIRD_PARTY_NOTICES.md`의 커밋을 바꾼다 | 외부 원본, 출처·라이선스 추적(ADR 19). `korean-writing`은 이 프로젝트가 쓴 것이라 고쳐도 된다 |
| `packages/protocol/` | 메시지 의미 변경 시 ADR + `PROTOCOL_VERSION` 올림(`src/version.ts`) | 기기·서버 호환성 |
| `content/*/id-changes.json` | 기록 수정·삭제 금지, 뒤에 추가만(`scripts/check-content.mjs` 4b단계가 검사) | 운영 데이터와 이미 배포된 팩이 옛 ID를 쓴다. 기록을 고치면 옛 ID의 새 ID·보상이 조용히 바뀐다(ADR `2026-10-28-content-pack-format.md`) |
| `content/*/` 팩 ID | 한 번 쓴 ID는 다시 쓰지 않는다. 지우거나 바꾸면 `id-changes.json`에 기록 | 같은 ID가 다른 것을 뜻하면 운영 데이터가 엉뚱한 항목을 가리킨다 |
| `apps/server/drizzle/` (올라간 마이그레이션) | 수정·삭제·이름 변경 금지, 새 마이그레이션 추가만(`scripts/check-docs.mjs`가 검사) | Drizzle은 이름으로만 건너뛰어, 고친 내용이 운영 DB와 조용히 어긋난다(ADR `2026-10-28-db-access-and-migrations.md`) |

생성되면 추가할 보호 대상(PLAN 10.4):

| 대상 | 규칙 | 이유 |
|---|---|---|
| `packages/sim/` | 판정 규칙 변경 시 ADR + `simVersion` 올림 | 결과 재현·공정성 |
| `packages/planet/` 생성기 | 출력이 바뀌는 변경 시 ADR + `generatorVersion` 올림 | 이미 생성된 세계와의 일치 |
| 원장·거래소 코드 | 변경 시 ADR + 불변 조건 테스트 통과 | 경제 무결성 |
