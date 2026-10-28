# PROTECTED

승인(사용자 확인 또는 ADR) 없이 바꾸면 안 되는 파일·시스템과 그 이유.

| 대상 | 규칙 | 이유 |
|---|---|---|
| `docs/DECISION_LOG.md` | 수정 금지(맨 끝에 추가만) | 계획 세션의 질문·답변 원문 기록 |
| `docs/adr/*.md` (확정된 것) | 수정 금지. 바꾸려면 새 ADR + 옛 ADR에 "대체됨" 표시 | 결정 이력 보존 |
| `docs/research/*.md` | 수정 금지 | 당시 기준 조사 원본 |
| `docs/design/` | 내용 수정 금지. 기술 세션은 기획 원본(AntiGravt01 `claude/sweet-wright-4ubb2u`의 `docs/GDD_v4/`)을 그대로 복사만 한다(절차: `docs/design/README.md`) | 기획서는 별도 기획 세션이 관리. 동기화 주체는 기획 결정 D-132(사용자 선택) |
| `.claude/skills/grill-me/`, `.claude/skills/grilling/` | 수정 금지(갱신은 원본 저장소에서 다시 복사) | 외부 원본(MIT) |
| `.claude/skills/`의 외부 스킬(frontend-design, ui-ux-pro-max, web-design-guidelines, react-best-practices, impeccable, hallmark, taste-skill, Emil Kowalski 스킬 8개, Matt Pocock 스킬 12개) | 수정 금지. 갱신은 원본에서 다시 복사하고 `THIRD_PARTY_NOTICES.md`의 커밋을 바꾼다 | 외부 원본, 출처·라이선스 추적(ADR 19). `korean-writing`은 이 프로젝트가 쓴 것이라 고쳐도 된다 |
| `packages/protocol/` | 메시지 의미 변경 시 ADR + `PROTOCOL_VERSION` 올림(`src/version.ts`) | 기기·서버 호환성 |
| `packages/sim/` | 판정 결과가 바뀌는 변경(비용·이웃 순서·동점·반올림·배치 규칙) 시 ADR + `SIM_VERSION` 올림(`src/version.ts`, 서버 `config.ts`도 같이). S1 임시 지형 출력이 바뀌면 `TEMP_TERRAIN_GENERATOR_VERSION` 올림. 골든 해시 시험을 함께 고친다 | 결과 재현·공정성 |
| `packages/planet/` 격자 계약: 셀 키 비트 배치, 면 배치, 면별 힐베르트 방향, `FACE_EDGE_LINKS`·`CUBE_CORNERS` 표 | 바꾸지 않는다. 바꿔야 하면 새 ADR + 저장된 키를 옮기는 계획. 골든 값·전수 시험을 함께 본다 | DB·캐시·전송에 들어간 키가 모두 다른 칸을 가리킨다(ADR `2026-10-29-cell-key-layout.md`) |
| `content/*/id-changes.json` | 기록 수정·삭제 금지, 뒤에 추가만(`scripts/check-content.mjs` 4b단계가 검사) | 운영 데이터와 이미 배포된 팩이 옛 ID를 쓴다. 기록을 고치면 옛 ID의 새 ID·보상이 조용히 바뀐다(ADR `2026-10-28-content-pack-format.md`) |
| `content/*/` 팩 ID | 한 번 쓴 ID는 다시 쓰지 않는다. 지우거나 바꾸면 `id-changes.json`에 기록 | 같은 ID가 다른 것을 뜻하면 운영 데이터가 엉뚱한 항목을 가리킨다 |
| `apps/server/drizzle/` (올라간 마이그레이션) | 수정·삭제·이름 변경 금지, 새 마이그레이션 추가만(`scripts/check-docs.mjs`가 검사) | Drizzle은 이름으로만 건너뛰어, 고친 내용이 운영 DB와 조용히 어긋난다(ADR `2026-10-28-db-access-and-migrations.md`) |
| `apps/server/src/auth/bridge.ts`의 `/api/auth` 허용 목록(세션 조회·로그아웃) | 넓히려면 ADR | Better Auth 기본 경로(가입·로그인·비밀번호 재설정·관리자)는 우리 출처 확인·시도 제한을 거치지 않는다(ADR `2026-10-28-auth-and-accounts.md`) |
| 감사 기록 추가만 트리거(`apps/server/drizzle/20261028112504_audit_log_append_only/`) | 지우거나 끄지 않는다. 바꾸려면 새 마이그레이션 + ADR | 감사 기록은 지울 수 없어야 한다(PLAN 4.8) |

생성되면 추가할 보호 대상(PLAN 10.4):

| 대상 | 규칙 | 이유 |
|---|---|---|
| `packages/planet/` 생성기 | 출력이 바뀌는 변경 시 ADR + `generatorVersion` 올림 | 이미 생성된 세계와의 일치 |
| 원장·거래소 코드 | 변경 시 ADR + 불변 조건 테스트 통과 | 경제 무결성 |
