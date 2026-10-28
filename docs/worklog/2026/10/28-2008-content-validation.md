# 콘텐츠 팩 검증 1·2·4·7단계, 팩을 서버 이미지에 포함

- 일시: 2026-10-28 20:08 (KST)
- 작업 도구: Claude Code (클라우드 세션, 서브에이전트 worktree)
- 관련: ADR `2026-10-28-content-pack-format.md`(새, ADR 24), `2026-10-28-content-packs.md`(ADR 13, 구체화), 조사 `docs/research/2026-10-28-content-validation-plan.md`, PLAN 7장·10.2·11(M0 "콘텐츠 검증 1·2·4·7단계")
- 정해진 것(메인 세션 전달, ADR에 기록): 팩은 이미지에 넣는다. 이름·설명은 ko·en 둘 다 필수(사용자가 바꿀 수 있음). 스테이징 스택은 따로 두지 않는다. M0 팩은 임시 데이터.

## 한 일
- `packages/content`(`@terra/content`, 의존성 zod 4.6.7)
  - 스키마: ID(`^[a-z][a-z0-9_]{1,47}$`), 언어별 문구(`{ko, en}` 둘 다 비어 있으면 안 됨), 참조(`ref("<분류>")` → `ContentRef`), 금액(숫자 문자열 → BigInt), manifest, id-changes, 분류 목록(M0는 `items`).
  - 검증: `validatePack(source, registry)` → 1단계 스키마 → 2단계 참조 무결성·4a단계 ID 변경표. 4b단계 `comparePacks`(기준 팩과 비교, 느슨하게 읽음). `LiveUsage` 자리(M0는 모두 쓰는 것으로 봄).
  - 문구: `✗ [단계] 파일 › ID › 경로: 문제. 고칠 방법.` Zod 오류는 한국어(`zod/locales` ko + 자주 나오는 경우는 직접 쓴 문구).
  - `@terra/content/node`: 팩 폴더 읽기, 해시(정규 JSON의 SHA-256). 나머지 코드는 Node API를 쓰지 않는다(oxlint가 막음, 브라우저 편집기용).
- `content/core`: 형식 확인용 임시 팩(`placeholder: true`, `dev_placeholder` 하나). 규칙·수치 없음.
- `scripts/check-content.mjs`(`pnpm check:content`): 작업 트리의 모든 팩 1·2·4a단계 + 기준 커밋의 팩과 4b단계. `--no-compat`, `--print`(서버 팩 버전·해시를 `key=value`로). Actions에서는 `::error file=…,line=…::`.
  - `resolveBase()`를 `scripts/lib.mjs`로 옮겨 `check-docs.mjs`와 함께 쓴다. `git()` 출력 상한을 64MiB로(큰 팩 `git show`).
  - `pnpm check`에 `pnpm check:content --no-compat`, 푸시 전 훅에 `pnpm check:content`(upstream과 비교).
- 서버
  - `CONTENT_VERSION` 설정을 없애고 `CONTENT_DIR`(기본: 저장소 `content/core`)로.
  - 시작할 때 1·2·4a단계 검사. 틀리면 한국어 오류를 찍고 코드 1로 끝난다(DB 연결 전). 임시 팩이면 경고 로그.
  - `contentVersion`은 `core@1` 형식. `/health`에 `contentHash`를 더했다(필드 추가만, `PROTOCOL_VERSION` 그대로).
- 배포(7단계)
  - `Dockerfile`: `content/`를 `/app/content`에, `ENV CONTENT_DIR=/app/content/core`. 설치 단계에 `packages/content/package.json`.
  - `ops/smoke.mjs`(표준 라이브러리만): `/health`(200, status ok, db·콘텐츠 버전·해시 기대값) + WebSocket hello → welcome(버전이 `/health`와 같음).
  - `ops/deploy.sh <태그> [콘텐츠 버전] [콘텐츠 해시]`: 7단계가 "healthy **그리고** 점검 통과". 실패하면 기존 되돌림.
  - `ci.yml`: `check` 작업에 "콘텐츠 검증 (content-check)" 단계(4b 포함, 버전·해시를 작업 출력으로). 이미지 작업은 컨테이너 안에서 점검(`EXPECT_DB=off`). 배포는 `needs: [check, image]`이고 버전·해시를 `deploy.sh`에 넘긴다.
  - `ops/compose.yml`: 쓰지 않는 `CONTENT_VERSION: ${TERRA_CONTENT_VERSION:-dev}` 삭제(이 값 때문에 NAS가 `dev`를 보고했다).
- 문서: ADR 24, PLAN 7장(구현 메모)·10.2·13, AGENTS.md 4장(콘텐츠 규칙)·6장(Node 24 타입 지우기)·7장(명령), PROTECTED(`content/*/id-changes.json` 뒤에 추가만, ID 다시 쓰기 금지), `ops/nas-setup.md`(배포 점검·팩 확인법).

## 확인 (Verified: 이 컨테이너, Node 24.22.1, pnpm 11.28.9, TS 7.0.2, PostgreSQL 16 임시 클러스터)
| 항목 | 결과 |
|---|---|
| `TEST_DATABASE_URL=… pnpm check` | 통과. 시험 123개(이번에 추가: 콘텐츠 50, 검사 스크립트 8, 서버 5) |
| `pnpm build` | 통과. 서버 번들에 zod·`@terra/content` 포함(`from "zod` 0건), `new URL("../../../content/core", import.meta.url)` 그대로 |
| `node scripts/check-content.mjs` | `✓ 콘텐츠 검증 통과 — core@1 (8060e741b14f), 단계 1·2·4a·4b(기준 …)`. 기준 커밋에 팩이 없어 4b는 "새 팩"으로 건너뜀 |
| `--print` | `content_version=core@1`, `content_hash=8060e741…4847b5`(64자) |
| 검사 스크립트 시험(임시 git 저장소) | 첫 커밋·새 팩 건너뜀, 기록 없이 ID 삭제 → 실패, 기록 추가 → 통과, 스키마 오류면 4b 안 돎, Actions 표시 `::error file=content/core/items.json,line=3,…`, 사라진 팩 폴더 → 실패 |
| 빌드한 서버 + 새 DB(PORT 4196) | `/health` → `{"status":"ok","db":"ok",…,"contentVersion":"core@1","contentHash":"8060e741…4847b5"}`. 로그에 팩 버전·해시, 임시 팩 경고 |
| `ops/smoke.mjs` | `SMOKE_URL` 방식·표준 입력 방식(`node --input-type=module - < ops/smoke.mjs`) 모두 `✓ 배포 점검 통과 — core@1 (8060e741b14f), db ok, 프로토콜 1`. 기대값을 틀리게 주면 2건 실패·코드 1, 서버가 없으면 코드 1 |
| DB 없이 + `CONTENT_DIR` 없이(기본 경로) | `db: off`, 기본 경로가 저장소 `content/core`로 풀림, 점검(`EXPECT_DB=off`) 통과 |
| 틀린 팩으로 서버 시작 | `✗ [스키마] …/items.json › dev_placeholder › name.en: 영어(en)가 없습니다. …` + `콘텐츠 팩 검증 실패 — 서버를 시작하지 않습니다`, 코드 1 |
| `deploy.sh` 흐름(가짜 docker) | healthy + 점검 실패 → 직전 태그로 `up -d app`, 코드 1, `deployed-tag` 그대로. 점검 통과 → 태그 기록. 인자 1개(되돌림 훈련처럼) → 기대값이 빈 채로 점검. 앱 헬스체크 실패(훈련 경우) → 점검은 돌지 않고 되돌림 |
| oxlint 경계 | 검증기 코드의 `node:fs`·`process`·`Buffer` → 3건 오류, `src/node/`의 같은 코드 → 0건 |
| `erasableSyntaxOnly` | enum·생성자 매개변수 속성 → TS1294 2건 |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/content/**`(새) | 팩 스키마·검증기·시험, `fixtures/valid` |
| `content/core/*`(새) | M0 임시 팩 |
| `scripts/check-content.mjs`(+시험, 새), `scripts/lib.mjs`, `scripts/check-docs.mjs` | 검사 명령, 기준 커밋 함수 공유 |
| `package.json`, `apps/server/package.json`, `pnpm-lock.yaml` | 작업공간 패키지 연결, `check:content`, `check`에 추가 |
| `.oxlintrc.json` | 검증기 코드의 Node API 금지(`src/node/` 제외) |
| `lefthook.yml` | 푸시 전 4b단계 |
| `apps/server/src/{config,content,main,app}.ts`, `content.test.ts` | `CONTENT_DIR`, 시작 때 검사, `/health`의 `contentHash` |
| `Dockerfile`, `ops/compose.yml` | 팩을 이미지에, 낡은 `CONTENT_VERSION` 삭제 |
| `ops/smoke.mjs`(새), `ops/deploy.sh`, `.github/workflows/ci.yml` | 7단계 점검, 버전·해시 전달 |
| `docs/adr/2026-10-28-content-pack-format.md`(새), `docs/PLAN.md`, `AGENTS.md`, `docs/PROTECTED.md`, `ops/nas-setup.md` | 결정과 규칙 |

## 함께 바꿔야 하는 파일
- 분류를 더하면: `packages/content/src/schema/categories.ts`(필드는 기획 확정 후). 분류 파일 이름 = 분류 이름.
- 팩 형식을 호환되지 않게 바꾸면: `CONTENT_FORMAT_VERSION`(`packages/content/src/version.ts`)과 모든 팩의 `formatVersion`을 같은 커밋에서.
- 서버가 싣는 팩을 바꾸면: `Dockerfile`의 `CONTENT_DIR`, `scripts/check-content.mjs`의 `SERVER_PACK`, `apps/server/src/config.ts`의 기본값.
- `/health` 필드 이름을 바꾸면: `ops/smoke.mjs`, `Dockerfile` HEALTHCHECK, CI 이미지 확인.
- 배포 단계를 바꾸면: `rollback-drill.yml`이 여전히 헬스체크 실패 경로를 타는지(지금은 점검 전에 실패한다).

## 건드리지 말 것
- `content/*/id-changes.json`의 기존 기록(뒤에 추가만, PROTECTED).
- 한 번 쓴 콘텐츠 ID를 다른 뜻으로 다시 쓰지 않는다.
- `check-docs.mjs`의 코드 경로에 `content/`를 넣지 않는다(팩만 바꾼 커밋은 작업 기록 없이).
- 검증기 코드(`packages/content/src`, `node/` 제외)에서 Node API를 쓰지 않는다.

## 미검증·TODO·알려진 문제
- 미실행(이 컨테이너에 Docker 없음): 이미지 빌드, CI 이미지 작업의 점검, NAS 배포 점검, 되돌림 훈련. 푸시 뒤 CI·NAS에서 확인한다.
- CI 운영 버전 PostgreSQL 18.6은 CI에서 확인한다(로컬은 16).
- `--print`일 때 Actions 오류 표시(`::error`)는 표준 오류로 나간다(표준 출력은 `$GITHUB_OUTPUT`). 실행기가 표준 오류의 워크플로 명령도 처리한다고 보고 있다(Assumed). 안 되면 오류 문구는 로그에 그대로 남는다.
- 계획과 다르게 한 것
  - 이름 바꾸기 사슬은 "지금 있는 ID"뿐 아니라 "보상 없이 지운 ID"에서 끝나도 된다(바꾼 뒤 지우는 경우). 대체 보상(`replace.with`)도 같은 사슬로 따라간다(그 ID가 나중에 바뀌어도 옛 기록을 고치지 않게).
  - JSON 문법 오류의 줄·칸은 V8이 줄 때만 나온다(`Unexpected token …`에는 없음).
  - `id-changes.json`은 바꾼 ID가 없어도 꼭 둔다(없으면 1단계 실패).
- Biome가 팩 JSON도 포맷한다. 편집기가 내보낸 파일은 커밋 전에 `pnpm format`을 거친다.
- ADR 번호 24는 PLAN 13장 기준이다. 같은 날 main에 올라온 PWA ADR(제안)이 확정되면 그 다음 번호를 쓴다.

## 사용자 결정 대기
- 이름·설명의 ko 필수를 유지할지(지금 필수, en만 필수로 바꿀 수 있음).
- 실유저 전: 운영 스택 + promote 워크플로(임시 팩 거절)를 더할지, 기존 운영을 먼저 내릴지. 막지 않는다.
