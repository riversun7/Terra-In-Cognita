# `pnpm dev` 통합 실행 및 콘텐츠 팩·DB 마이그레이션 자동 재기동

- 일시: 2026-11-24 21:58 (KST)
- 작업 도구: Antigravity
- 관련: `scripts/dev-local.mjs`, `apps/server/package.json`

## 한 일
- 루트 `package.json`에 `"dev": "node scripts/dev-local.mjs"` 별칭을 추가해 `pnpm dev` 한 번으로 로컬 DB 준비·백엔드(`4100`)·프론트엔드(`5173`) 통합 실행이 되도록 맞췄습니다(**Verified**).
- `apps/server/package.json`의 `dev` 스크립트에 `--clear-screen=false --include ../../content/core` 옵션을 더해 `content/core/*.json` 변경 시에도 백엔드 서버(`tsx watch`)가 자동으로 재기동되게 했습니다(**Verified**).
- `scripts/dev-local.mjs`와 `scripts/dev-local-watch.mjs`에 `apps/server/drizzle` 디렉터리 감시·디바운스·직렬 실행(`db:migrate`)을 추가해 새 마이그레이션이 들어오면 자동으로 마이그레이션을 적용한 뒤 백엔드를 재기동하도록 개선했습니다(**Verified**: 단위 시험 5건, 로컬 서버 재기동 확인).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `package.json` | `pnpm dev` 루트 스크립트 추가(`scripts/dev-local.mjs`) |
| `apps/server/package.json` | `tsx watch`에 `--clear-screen=false --include ../../content/core` 추가 |
| `scripts/dev-local-watch.mjs` | 마이그레이션 출력 파싱, 디바운스·직렬 실행, 안전한 프로세스 종료 도우미 분리 |
| `scripts/dev-local-watch.test.mjs` | `dev-local-watch.mjs` 단위 시험 5건 추가 |
| `scripts/dev-local.mjs` | `apps/server/drizzle` 감시 및 마이그레이션 적용 후 서버 자동 재기동 연결 |
| `README.md` | `pnpm dev` 및 자동 반영·재기동 안내 반영 |

## 함께 바꿔야 하는 파일
- `scripts/dev-local.mjs`를 수정할 때는 `scripts/dev-local-watch.mjs`와 `scripts/dev-local-watch.test.mjs`를 함께 확인합니다.

## 건드리지 말 것
- `scripts/dev-env.mjs`의 로컬 호스트 DB 차단 가드(`assertLocalDatabaseUrl`)는 유지합니다.

## 미검증·TODO·알려진 문제
- 전체 `pnpm check`가 아닌 변경 대상 검사(`biome format`, `oxlint`, `check:boundaries`, `dev-local-watch.test.mjs`, `docs:index`, `check-docs`, 서버 기동 확인)만 실행했습니다.

## 사용자 결정 대기
- 없음.
