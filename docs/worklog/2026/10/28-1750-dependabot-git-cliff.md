# Dependabot 주간 업데이트, git-cliff 변경 이력 설정

- 일시: 2026-10-28 17:50 (KST)
- 작업 도구: Claude Code (클라우드 세션)
- 관련: ADR `2026-10-28-dependency-updates.md`(새), `2026-10-28-dev-workflow.md`(상태에 일부 대체됨 표시), PLAN 3장·10.2·13

## 한 일
- Dependabot(`.github/dependabot.yml`): 매주 월요일 09:00 KST, npm(pnpm 작업공간)과 GitHub Actions.
  - 공개 후 3일(메이저 7일) 지난 버전만 제안한다. pnpm의 `minimumReleaseAge`(1일)와 부딪히지 않게 하려는 것.
  - minor·patch는 PR 하나로 묶는다.
  - pnpm과 `@types/node` 메이저는 자동 제안에서 뺐다(손으로 올림).
- 문서 검사(`scripts/check-docs.mjs`): 아래 두 경우는 작업 기록 검사에서 뺀다. 봇 PR과 합친 뒤의 main 검사가 같은 결과를 낸다.
  - package.json에서 의존성 버전 문자열만 바뀐 경우
  - 워크플로에서 `uses:` 줄만 바뀐 경우
- git-cliff(`cliff.toml`, `pnpm changelog --tag vX.Y.Z`): Conventional Commits를 한국어 묶음으로 정리한다(기능·수정·성능·구조 개선·문서·테스트·빌드·의존성·CI·기타). 지금까지 커밋 21개가 모두 형식에 맞아 21줄로 나온다.
- 야간 CI는 만들지 않았다. 아직 돌릴 것(E2E, 생성기 해시, 성능 스모크)이 없다.

## 확인 (Verified: 임시 작업 트리에서 실행)
| 경우 | 기대 | 결과 |
|---|---|---|
| A. 의존성 버전만 올림 + lockfile | 통과 | 통과 |
| B. 새 런타임 의존성 추가 | 실패(작업 기록·ADR) | 실패 |
| C. 액션 버전만 올림(`uses:`) | 통과 | 통과 |
| D. 워크플로 `run:` 줄 변경 | 실패 | 실패 |
| E. package.json `scripts` 변경 | 실패 | 실패 |
| F. 버전 올림 + 코드 변경 | 실패 | 실패 |
| G. devDependencies → dependencies 이동 | 실패(작업 기록·ADR) | 실패 |
| H. 코드 변경 + 작업 기록 | 통과 | 통과 |

git-cliff: `pnpm changelog --tag v0.1.0`으로 `CHANGELOG.md`가 만들어지는 것을 확인하고 지웠다. 첫 버전 태그 때 만든다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `.github/dependabot.yml` | 주간 의존성 업데이트 설정 |
| `scripts/check-docs.mjs` | 버전 올림만 있는 변경은 작업 기록 검사에서 제외 |
| `cliff.toml`, `package.json`(`changelog` 스크립트) | 변경 이력 생성 |
| `docs/adr/2026-10-28-dependency-updates.md` | 결정 기록(ADR 21) |
| `docs/adr/2026-10-28-dev-workflow.md` | 상태 줄에 "일부 대체됨" 표시만 추가 |
| `docs/PLAN.md`(3장, 10.2, 13), `AGENTS.md`(6·7장) | 반영 |

## 함께 바꿔야 하는 파일
- pnpm 버전: `package.json`의 `packageManager`, CI의 `PNPM_VERSION`, `Dockerfile`, AGENTS.md 6·7장.
- Node 버전: `Dockerfile`, CI의 `NODE_VERSION`, AGENTS.md 6장.
- postgres 이미지: `ops/compose.yml`, `ops/restore-check.sh`.
- 커밋 종류를 늘리면 `commitlint.config.mjs`와 `cliff.toml`의 `commit_parsers`.

## 건드리지 말 것
- `pnpm-workspace.yaml`의 `minimumReleaseAge`를 낮추지 않는다(공급망 보호). 봇 PR이 이 규칙으로 실패하면 하루 뒤 CI를 다시 실행한다.

## 미검증·TODO·알려진 문제
- Dependabot 첫 실행 결과(Verified, 2026-10-28 푸시 직후 자동 실행):
  - npm: pnpm을 인식했고, 로그에 "pnpm-workspace.yaml minimumReleaseAge (1440 minutes, 1 days) is already satisfied by all dependabot.yml update_cooldown values"가 나왔다. 올릴 것은 없었다. 몇 개는 3일 대기에 걸려 미뤄졌다. `@types/node` 메이저는 무시됐다.
  - GitHub Actions: PR #1(`actions/checkout`·`actions/setup-node` 6 → 7, 메이저)을 열었다. 이 PR의 CI가 통과했다 → 워크플로 `uses:` 줄 예외가 실제로 동작했다. 합칠지는 사용자 결정.
  - `ignore: pnpm`: 로그에 pnpm 확인 줄이 없다. `packageManager` 필드를 의존성으로 다루지 않는 것으로 보인다(Assumed).
- Dependabot PR을 합치는 사람: 사용자(또는 사용자가 맡긴 에이전트). 합치면 main CI가 NAS에 배포한다.
- 야간 CI: 첫 E2E 테스트가 생길 때 만든다.
- Actions 무료 한도는 월 2,000분이다. 코드 푸시 1회는 약 3분이다(작업 3개, 각 1분 미만을 분 단위로 올려 셈. 올림 규칙은 Assumed).

## 사용자 결정 대기
- 없음
