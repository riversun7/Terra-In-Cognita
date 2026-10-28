# 콘텐츠 팩 형식과 검증(M0: 1·2·4·7단계), 이미지에 팩 포함

- 상태: 확정
- 날짜: 2026-10-28
- 관련: docs/PLAN.md 7장·8장·9.1·10.2, `2026-10-28-content-packs.md`(ADR 13, 이 ADR이 구체화한다), `2026-10-28-i18n.md`(ADR 14), `2026-10-28-deploy-and-ops.md`(ADR 15), 조사 `docs/research/2026-10-28-content-validation-plan.md`

## 배경
ADR 13은 콘텐츠 팩과 검증 7단계를 정했다. M0에서는 1·2·4·7단계를 시작한다. 구현하려면 정할 것이 있었다.
- 팩 폴더·파일 모양, ID 규칙, 버전을 붙이는 법
- ID의 이름 변경·삭제를 어디에 어떻게 남길지
- 운영 서버가 팩을 받는 법("롤백 = 이전 팩")
- 7단계 "스테이징 배포 + 자동 점검 → 운영 반영"의 대상
- 검증 라이브러리(새 런타임 의존성)

또 NAS는 `contentVersion: "dev"`를 보고하고 있었다(Verified: compose 기본값 `TERRA_CONTENT_VERSION:-dev`, `deploy.sh`가 값을 주지 않음).

## 선택지
- 팩 원본: 버전마다 폴더 복사(`content/core/v3/`) / **팩마다 폴더 하나, 이력은 git**
- 항목: ID를 키로 한 객체 / **배열(`entries`)**
- 서버가 팩을 받는 법: **이미지에 넣기** / 배포 때 따로 내려받기(버전 붙은 경로) / DB에 넣기
- 4단계 비교 기준: 릴리스 태그 / **CI·문서 검사와 같은 기준 커밋**
- 검증 라이브러리: **Zod 4.6.7(이미 사용 중)** / JSON Schema + Ajv / Valibot / 직접 작성

## 결정

### 팩 모양
- `content/<팩 ID>/`에는 `manifest.json`, `id-changes.json`, `<분류>.json`(예: `items.json`)만 둔다. 다른 파일·폴더는 2단계에서 실패한다.
- `manifest.json`
  - `formatVersion`: 코드의 `CONTENT_FORMAT_VERSION`과 같아야 한다. 기존 팩이 통과하지 못하게 스키마를 바꾸면 올리고, 팩도 같은 커밋에서 고친다.
  - `packId`: 폴더 이름과 같아야 한다.
  - `version`: 1 이상 정수. 내용을 바꾸면 올린다. 내리지 않는다.
  - `placeholder`(선택): 기획 확정 전 임시 데이터. `note`(선택): `{ko, en}` 메모.
- 분류 파일은 `{"entries": [...]}`이다. 분류 목록과 필드는 `packages/content/src/schema/categories.ts`에 있다.
- ID
  - 영어 snake_case `^[a-z][a-z0-9_]{1,47}$`(소문자로 시작, 2~48자).
  - 분류(파일) 안에서 하나만 있다. 한 번 쓴 ID는 다시 쓰지 않는다.
  - M0에는 이름공간이 없다.
- 문구: 이름(`name`, 필수)·설명(`description`, 선택)은 `{ko, en}`이다. **ko와 en 둘 다 비어 있지 않아야** 한다.
- 참조: 스키마에 `ref("<분류>")`로 한 번만 선언한다. 2단계가 파싱 결과에서 모아 대상이 있는지 본다.
- 수: 기본은 정수(`z.int()`). 금액은 최소 단위 정수를 숫자 문자열로 적고 BigInt로 읽는다(`amount`, AGENTS.md 4장).
- 버전·해시
  - 기기·서버가 주고받는 `contentVersion`은 `<팩 ID>@<version>`이다(예: `core@1`). 프로토콜은 비어 있지 않은 문자열이면 받는다(Verified: `messages.ts`).
  - `contentHash`는 정규 JSON(객체 키 정렬, 분류 항목은 ID 순)의 SHA-256이다. 줄 바꿈·키 순서·항목 순서만 바뀌면 같다.
  - `generatorVersion`은 manifest 필드가 아니라 생성 결과에 찍는 코드 상수다(PLAN 5.5).
- `id-changes.json`
  - `renamed`: `{category, from, to, since}`. `removed`: `{category, id, since, compensation}`.
  - `compensation`은 M0에 `{"kind": "none"}`과 `{"kind": "replace", "with": "<ID>"}`만 있다. 실제 보상 규칙은 기획 확정 후.
  - `since`는 그 변경이 들어간 팩 버전이다.
  - **뒤에 추가만** 한다. 고치거나 지우지 않는다(`docs/PROTECTED.md`, 4b단계가 검사).
- 팩 JSON도 Biome 포맷 대상이다(`pnpm format`).

### 검증 단계
| 단계 | 검사 | 어디서 |
|---|---|---|
| 1 스키마 | JSON 문법, 모르는 필드(오타), 타입·필수 값·범위, 형식 버전, 팩 ID. 문구는 한국어 | `pnpm check`, CI, 서버 시작 |
| 2 참조 | 중복 ID, 없는 ID 참조(편집 거리 2 이하면 "혹시 …?"), 모르는 파일, 꼭 참조되어야 하는 분류(`mustBeReferenced`)의 고아 항목 | 같음 |
| 4a 변경표 | 이름 바꾸기·대체 사슬이 지금 있는 ID(또는 보상 없이 지운 ID)에 닿는지, 순환, 옛 ID 다시 쓰기, 한 ID 한 기록, `since` ≤ 지금 버전 | 같음 |
| 4b 호환 | 기준 팩과 비교: 기록 없이 사라진 ID, 옛 기록 수정·삭제, 내용이 바뀌었는데 버전 그대로, 버전 내림, 새 기록의 `since`가 (기준 버전, 지금 버전] 밖 | 푸시 전(upstream), CI(기준 커밋) |
| 7 배포 점검 | `/health`(status, db, 콘텐츠 버전·해시) + WebSocket hello → welcome(같은 버전). 실패하면 되돌림 | CI 이미지 작업(db off), NAS 배포 |

- 1단계에서 오류가 나면 2·4단계는 돌리지 않는다.
- 문구 형식: `✗ [단계] 파일 › ID › 경로: 문제. 고칠 방법.` GitHub Actions에서는 `::error file=…,line=…::`도 찍는다.
- 검증 코드(`packages/content`)는 파일 시스템·git을 쓰지 않는다. 같은 함수(`validatePack`)를 검사 스크립트, 서버 시작, 나중의 브라우저 편집기가 쓴다. 파일 읽기·해시만 `@terra/content/node`에 있다.
- 4b 기준 커밋은 `check-docs.mjs`와 같다: 인자(`pull_request.base.sha || event.before`) → `@{u}` → `HEAD~1` → 없으면 건너뜀. `resolveBase()`는 `scripts/lib.mjs`로 옮겨 함께 쓴다.
- 4b는 기준 쪽을 느슨하게 읽는다(`entries[].id`, manifest, id-changes만). 같은 커밋에서 스키마가 바뀌어도 비교할 수 있다. 기준 쪽 JSON이 깨져 있으면 경고만 하고 건너뛴다.
- 운영 데이터: M0에는 콘텐츠 ID를 담은 표가 없다(Verified: `apps/server/src/db/schema.ts`). 그래서 모든 ID를 쓰는 것으로 본다. 지우거나 바꾸면 항상 기록이 필요하다. 나중을 위해 `LiveUsage(category, ids) → 횟수` 자리를 만들었다(쓰는 횟수가 0인 ID는 기록 없이 지워도 된다).

### 배포
- **팩은 서버 이미지에 넣는다**(`/app/content/core`, `ENV CONTENT_DIR`). 코드와 팩이 함께 배포되고 함께 되돌아간다. "롤백 = 이전 팩"은 이미지 태그로 지킨다.
- 서버는 시작할 때 1·2·4a단계를 돌린다. 틀리면 한국어 오류를 찍고 코드 1로 끝난다. 그러면 healthy가 되지 않아 기존 되돌림(배포 7단계)이 돈다.
- 설정 `CONTENT_VERSION`은 없애고 `CONTENT_DIR`로 바꾼다. 개발 기본값은 저장소의 `content/core`다.
- `/health`에 `contentHash`를 더한다(필드 추가라 이전과 호환). WebSocket 메시지는 그대로라 `PROTOCOL_VERSION`도 그대로다.
- 7단계 점검(`ops/smoke.mjs`, 표준 라이브러리만)
  - CI `check` 작업이 검사를 통과한 팩의 버전·해시를 작업 출력으로 낸다.
  - 이미지 작업은 컨테이너 안에서 점검한다(`EXPECT_DB=off`).
  - `deploy.sh <태그> [콘텐츠 버전] [콘텐츠 해시]`는 "healthy **그리고** 점검 통과"여야 배포를 끝낸다. 아니면 직전 버전으로 되돌린다.
  - 점검은 컨테이너 안의 node로 돈다(`docker exec -i … node --input-type=module - < ops/smoke.mjs`). 실행기에 node·curl·jq가 없어도 된다.
- 콘텐츠만 바뀐 푸시도 이미지를 빌드하고 배포한다. 팩이 이미지 안에 있기 때문이다(배포 생략은 문서·스킬만).

### 스테이징
- 따로 스테이징 스택을 두지 않는다. 지금 NAS의 새 스택(실유저 없음)이 스테이징이다. 7단계의 "운영 반영"은 아직 대상이 없다.

### 의존성
- `packages/content`의 런타임 의존성은 **zod 4.6.7** 하나다(MIT). `packages/protocol`·`apps/server`가 이미 쓰는 같은 버전이라 새 외부 패키지는 없다(잠금 파일에 이미 있음).
- 검사 스크립트는 빌드 없이 `node`로 `.ts`를 바로 읽는다(Node 24 타입 지우기). 그래서 `packages/content`는 `erasableSyntaxOnly`를 켠다(enum·namespace·생성자 매개변수 속성 금지). tsx는 쓰지 않는다.
- `src/node/`(파일 읽기·해시)만 Node API를 쓴다. 나머지에서는 oxlint가 Node 모듈·전역(`process`, `Buffer`)을 막는다.

### M0 팩
- `content/core`는 형식 확인용 임시 팩이다: `placeholder: true`, `dev_` ID, 분류는 `items` 하나, 기본 필드(`id`, `name`, `description`)만.
- 게임 규칙·수치는 넣지 않는다. 기획 세션이 `docs/design/`에서 정한다.

## 이유
- **폴더 하나 + git 이력**: 버전마다 복사하면 같은 데이터가 여러 벌 생기고 차이를 보기 어렵다. git이 이력을 갖고, 4b는 git의 기준 커밋과 비교한다.
- **배열**: `JSON.parse`는 같은 키가 두 번 나오면 말없이 뒤의 것만 남긴다(Verified: 조사 때 시험). 객체로 두면 중복 ID를 찾을 수 없다.
- **ko도 필수**: PLAN 7장·ADR 14는 en만 요구한다. 하지만 한국어가 기본 언어이고, UI 메시지 규칙도 ko·en을 함께 요구한다. 사용자가 다르게 정하면 `localizedText` 한 곳만 바꾸면 된다.
- **이미지에 넣기**
  - 코드와 팩의 짝이 깨지지 않는다. 새 스키마를 아는 코드만 새 팩을 읽는다.
  - 되돌림이 이미지 태그 하나로 끝난다.
  - 팩은 작은 JSON이다. PLAN 9.8의 "앱 이미지에 에셋을 넣지 않는다"는 이미지·모델 원본 이야기라 해당하지 않는다.
  - 따로 내려받으면 배포·되돌림 단계가 늘고, 팩과 코드 버전이 어긋날 수 있다.
- **릴리스 태그가 아닌 기준 커밋**: main 푸시마다 배포하고, 태그는 변경 이력에만 쓴다(Verified: `ci.yml`, `cliff.toml`). 기록은 뒤에 추가만 하고 ID를 다시 쓰지 않으므로, 푸시마다의 검사가 쌓여 이미 배포된 (더 옛) 팩도 덮는다(Assumed. 강제 푸시로 기준 커밋이 사라지면 빈틈이 생긴다).
- **Zod**
  - 서버·프로토콜이 이미 같은 버전을 쓴다.
  - 스키마에서 타입이 나온다. `transform`으로 참조를 표시할 수 있다(Verified: 4.6.7 시험).
  - 한국어 오류 문구를 파싱마다 지정할 수 있다(`zod/locales`의 `ko`, Verified: 4.6.7 시험). 자주 나오는 경우는 더 쉬운 문구로 바꿨다(`koreanErrorMap`).
  - JSON Schema + Ajv는 새 의존성이 필요하고 타입을 따로 만들어야 한다. Valibot도 새 의존성이다. 직접 작성하면 오류 위치·문구를 모두 만들어야 한다.
- **스테이징을 따로 두지 않는 이유**: 새 스택 상한은 앱 1GB + DB 1GB다. NAS 메모리 3,890MB 중 사용 가능 메모리는 약 2,000MB다(Verified: `ops/nas-facts.md`, 기존 운영·다른 DB와 함께). 실유저가 없으니 지금 NAS가 곧 스테이징이다.

## 결과
- 팩만 바꿔도 이미지를 다시 빌드한다.
- ID를 지우거나 바꾸면 `id-changes.json`에 기록하고 `version`을 올려야 푸시 전 검사와 CI를 통과한다.
- 콘텐츠만 바꾼 커밋은 작업 기록이 필요 없다(`check-docs.mjs`의 코드 경로에 `content/`가 없다). 편집기 내보내기 커밋을 가볍게 하려고 그대로 둔다.
- JSON 문법 오류의 줄·칸은 V8이 위치를 줄 때만 나온다. `Unexpected token …` 종류에는 위치가 없다(Verified: Node 24.22.1). `pnpm check`의 Biome 포맷 검사도 위치를 알려 준다.
- 사용자 결정 대기(작업을 막지 않음)
  - **ko 필수 유지 여부**: 지금은 ko·en 둘 다 필수다. en만 필수로 바꿀 수 있다.
  - **실유저가 오기 전**: 운영 스택 + `promote` 워크플로(검증된 이미지 태그를 운영으로 올림, `placeholder: true` 팩은 거절)를 더할지, 아니면 기존 운영 환경을 먼저 내리고 새 스택을 운영으로 쓸지.
- 기획 세션에 넘길 것(운영 데이터가 생기기 전): 실제 분류와 필드, 지운 ID의 보상 규칙(환불·수량).
- 나중에 할 일
  - 운영 데이터가 생기면 `deploy.sh`가 NAS에서 실행 중인 팩과 DB를 보고 강한 4단계 검사(`LiveUsage`)를 한다. DB는 호스트 포트가 없어서 CI에서는 닿지 않는다.
  - 이름 변경을 운영 표에 적용하는 배포 단계를 더한다.
  - 팩을 코드와 따로 배포해야 하면(편집기 "공개") 버전 붙은 경로 방식으로 바꾸고 새 ADR을 쓴다.
