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
| `packages/planet/src/generator/` 행성 생성기와 출력 모양·물 비트 정의(`src/tiles/fields.ts`) | 출력(`PlanetFields` 어느 필드든, 결과 해시)이 한 칸이라도 바뀌는 변경(알고리즘·상수·프리셋 값·바이옴 판정·반올림·반복 순서, 필드·물 비트 정의)은 ADR + `GENERATOR_VERSION` 올림(`src/generator/version.ts`) + 골든 해시 시험(`generate.test.ts`)을 같은 커밋에서 고친다. 물 비트를 바꾸면 타일 형식 버전(`PLANET_TILE_FORMAT_VERSION`)도 | 이미 만든 세계, 서버 캐시(정의 해시, `GENERATOR_VERSION`), 편집기 미리보기와 서버 결과가 같아야 한다(PLAN 5.5, ADR `2026-10-29-s2-planet-lod.md`) |
| `packages/planet/src/secondMap/` 2차맵 생성기와 지표 번호(`SM_SURFACE` = protocol `TERRAIN_SURFACE`), 소품 그림 번호(`packages/shared/src/mapProps.ts` `MAP_PROP_ARTS`) | 출력(높이·물 높이·지표·엄폐·소품 그림, 결과 해시)이 한 칸이라도 바뀌는 코드 변경은 ADR 46 부록 + `SECOND_MAP_GENERATOR_VERSION` 올림(`src/secondMap/version.ts`) + 골든 해시 시험(`generate.test.ts`)·이음매 시험(`seams.test.ts`)을 같은 커밋에서 고친다. WP-3부터 서버가 이 생성기로 2차맵을 내므로 출력이 바뀌면 판을 꼭 올린다(지형 주소 판 표지·디스크 캐시 이름이 갈린다. 고정본 이웃 경계 섞기(U3)는 처음 판을 올릴 때 함께 만든다). 지표 번호·소품 그림 번호는 한 번 쓴 번호를 다른 뜻으로 다시 쓰지 않는다(새 것은 끝에 더한다). 콘텐츠 `map_props`를 바꿔 출력이 바뀌는 것은 판을 올리지 않는다: 결과에 규칙 해시(`propRulesHash`)가 있어 캐시 열쇠가 갈린다(WP-3) | 캐시·지형 파일 주소·고정본 2차맵이 판으로 갈린다. 이웃 2차맵 경계가 같은 값이어야 한다(ADR `2026-10-31-second-map-from-planet.md`) |
| 표 `second_map_pins`(2차맵 고정본, `apps/server/src/world/pins.ts`) | 처음 손댄 때 한 번만 쓰고(on conflict do nothing) 고치거나 지우지 않는다. 고정본이 있는 2차맵은 생성기 판이 바뀌어도 고정본 지형을 쓴다. 예외: 시험 세계 새로 시작(`reset-world`)은 건물을 모두 지우므로 고정본도 함께 지운다(ADR `2026-11-08-world-reset.md`, 사용자 결정 645 다) | 플레이어가 지은 것이 지형 아래로 꺼지거나 물에 잠기지 않게 한다(PLAN 5.5, ADR `2026-10-31-second-map-from-planet.md` 6절) |
| `packages/shared/src/detMath.ts` 결정적 수학 함수 | 사칙연산과 명세가 정한 `Math` 함수만 쓴다(경계 검사가 본다). 값이 한 비트라도 바뀌는 변경은 `GENERATOR_VERSION`을 올리고(판정 코드가 쓰게 되면 `SIM_VERSION`도) 골든 비트(`detMath.test.ts`)·생성기 골든 해시·실수 지문(`generate.test.ts`)을 같은 커밋에서 고친다. 골든 비트는 적어 둔 점만 보므로 모든 변경을 잡지는 않는다 | 엔진·버전과 무관하게 같은 값이어야 생성·판정 결과를 재현한다(ADR `2026-10-29-s2-planet-lod.md`) |
| `packages/shared/src/planetPresets.ts` 프리셋 수치표 | 값을 바꾸면 같은 행성 정의의 생성 결과가 바뀐다: `GENERATOR_VERSION` 올림 + 수치표 고정 시험(`planetPresets.test.ts`)·생성기 골든 해시를 같은 커밋에서 고친다 | 생성기 행과 같다. 콘텐츠 검증과 생성기가 같은 표를 쓴다(ADR `2026-10-29-s2-planet-lod.md`) |
| `packages/shared/src/planetCalendar.ts` 행성 달력: 하루·계절·한 해(`PLANET_DAY_MS` 등)와 기원(`PLANET_CALENDAR_EPOCH_MS`) | 하루·계절·한 해는 기획 값(D-091·D-5030)이다. 바꾸려면 ADR + 달력 시험(`planetCalendar.test.ts`)과 판정 쪽 계절 보정 시험(생기면)을 같은 커밋에서 고친다. 판정 코드가 쓰게 되면 `SIM_VERSION`도 올린다. 기원은 지금 `[임시]`이고, 출시 전에 기획 답(`docs/questions/2026-10-29-game-calendar.md` 질문 1)으로 한 번 정한다. 출시 뒤에는 바꾸지 않는다 | 연도·나이(D-021)·계절 보정(D-118)이 모두 이 값에서 나온다. 바꾸면 쌓인 날짜·계절이 밀리고, 서버 판정의 계절과 기기 하늘이 어긋난다(ADR `2026-10-29-primary-map-sky.md`) |
| `content/*/id-changes.json` | 기록 수정·삭제 금지, 뒤에 추가만(`scripts/check-content.mjs` 4b단계가 검사) | 운영 데이터와 이미 배포된 팩이 옛 ID를 쓴다. 기록을 고치면 옛 ID의 새 ID·보상이 조용히 바뀐다(ADR `2026-10-28-content-pack-format.md`) |
| `content/*/` 팩 ID | 한 번 쓴 ID는 다시 쓰지 않는다. 지우거나 바꾸면 `id-changes.json`에 기록 | 같은 ID가 다른 것을 뜻하면 운영 데이터가 엉뚱한 항목을 가리킨다 |
| `apps/server/drizzle/` (올라간 마이그레이션) | 수정·삭제·이름 변경 금지, 새 마이그레이션 추가만(`scripts/check-docs.mjs`가 검사) | Drizzle은 이름으로만 건너뛰어, 고친 내용이 운영 DB와 조용히 어긋난다(ADR `2026-10-28-db-access-and-migrations.md`) |
| `apps/server/src/auth/bridge.ts`의 `/api/auth` 허용 목록(세션 조회·로그아웃) | 넓히려면 ADR | Better Auth 기본 경로(가입·로그인·비밀번호 재설정·관리자)는 우리 출처 확인·시도 제한을 거치지 않는다(ADR `2026-10-28-auth-and-accounts.md`) |
| 감사 기록 추가만 트리거(`apps/server/drizzle/20261028112504_audit_log_append_only/`) | 지우거나 끄지 않는다. 바꾸려면 새 마이그레이션 + ADR | 감사 기록은 지울 수 없어야 한다(PLAN 4.8) |
| 화면 주소 표 `packages/shared/src/routes.ts` | 경로를 지우거나 바꾸면 옛 경로를 새 경로로 넘긴다 | 즐겨찾기와 나중의 푸시가 옛 주소를 가리킨다. 서버와 서비스 워커도 이 표로 화면 경로를 판정한다(ADR `2026-10-29-app-shell.md`) |
| 계정에 저장되는 ID: 메뉴 항목(`packages/shared/src/navigation.ts`), 카드·템플릿(`dashboard.ts`), 처리할 일 종류(`inbox.ts`), 역할 이름(`roles.ts`), 운영 권한 ID(`ops.ts` `OPS_PERMISSIONS`, 표 `ops_grants`) | 한 번 쓴 ID는 다시 쓰지 않는다 | 계정 설정(`user_settings`의 `nav`·`home`)과 처리할 일 항목 ID·주소(`?item=`)에 남는다. 같은 ID를 다른 뜻으로 다시 쓰면 저장된 값이 엉뚱한 것을 가리킨다(ADR `2026-10-29-app-shell.md`) |

생성되면 추가할 보호 대상(PLAN 10.4):

| 대상 | 규칙 | 이유 |
|---|---|---|
| 원장·거래소 코드(`packages/sim/src/ledger/`, `packages/sim/src/economy/`, 서버 `apps/server/src/economy/`) | 변경 시 ADR + 불변 조건 테스트 통과 | 경제 무결성 |
