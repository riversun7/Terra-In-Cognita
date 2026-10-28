# 의존성 자동 업데이트 (Dependabot)

- 상태: 확정
- 날짜: 2026-10-28
- 관련: docs/PLAN.md 3장(버전 정책)·10.2, `2026-10-28-stack-baseline.md`, `2026-10-28-dev-workflow.md`

## 배경
버전을 정확히 고정하므로(`^`·`~` 금지) 올리지 않으면 보안 수정이 들어오지 않는다. PLAN은 주간 Dependabot PR로만 올리기로 했다. 그대로 켜면 두 가지가 막는다.
1. pnpm 11의 `minimumReleaseAge`(공개 1일 미만 버전 설치 금지)와 부딪힌다. Dependabot이 lockfile을 다시 만들 때 하루가 안 된 버전이 들어가면 CI 설치가 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`으로 실패한다(Verified: 2026년 공개 이슈 여러 건, 예: tinacms/tinacms#7949, dependabot-core PR #16521).
2. 우리 문서 검사(`scripts/check-docs.mjs`)는 `apps/*`·`packages/*`의 package.json이나 워크플로가 바뀌면 작업 기록을 요구한다. 봇 PR에는 작업 기록이 없어서 항상 실패하고, 합친 뒤 main 검사도 실패한다.

## 선택지
- 도구: **Dependabot**(GitHub 내장) / Renovate(외부 앱 설치, pnpm 설정이 더 많음)
- 문서 검사: 봇 PR만 건너뛰기 / **바뀐 내용이 버전 올림뿐인지 판정해 건너뛰기**
- 기다리는 기간: pnpm의 `minimumReleaseAge`를 낮추기 / **Dependabot의 `cooldown`을 그보다 길게**

## 결정
- Dependabot, 매주 월요일 09:00(KST). 대상은 npm(pnpm 작업공간)과 GitHub Actions. 설정은 `.github/dependabot.yml`.
- `cooldown`: 공개 후 3일(메이저 7일)이 지난 버전만 제안한다. pnpm의 1일보다 길다. `minimumReleaseAge`는 낮추지 않는다.
- minor·patch는 PR 하나로 묶고, 메이저는 따로 연다.
- 손으로 올리는 것(자동 PR 없음):
  - pnpm: CI의 `PNPM_VERSION`, `Dockerfile`, AGENTS.md와 함께 바꿔야 한다.
  - `@types/node` 메이저: Node 24에 맞춘다.
  - Docker 이미지: node(`Dockerfile`과 CI의 `NODE_VERSION`), postgres(`ops/compose.yml`과 `ops/restore-check.sh`)처럼 함께 바꿀 파일이 있다.
  - 실행기 이미지: NAS에 직접 붙여넣어 쓰므로 저장소만 바뀌면 실제와 달라진다.
- 문서 검사: package.json에서 의존성 **버전 문자열만** 바뀐 파일, 워크플로에서 **`uses:` 줄만** 바뀐 파일은 코드 변경으로 치지 않는다. 의존성 이름이 늘거나 줄거나 다른 필드가 바뀌면 그대로 작업 기록을 요구한다.
- 봇 PR이 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`으로 실패하면 하루 뒤 CI를 다시 실행한다.

## 이유
- Dependabot은 GitHub 내장이라 저장소 권한을 줄 외부 앱이 없다. 우리 규모에서는 Renovate의 추가 기능이 필요 없다.
- 봇 계정만 건너뛰면 합친 뒤 main 푸시 검사에서 다시 실패한다. 내용으로 판정하면 PR과 main이 같은 결과를 낸다. 판정 규칙은 가짜 변경 8가지로 확인했다(Verified: 작업 기록 `docs/worklog/2026/10/28-1750-dependabot-git-cliff.md`).
- 묶음 PR은 CI 실행 횟수를 줄인다. GitHub Free의 비공개 저장소 Actions 한도는 월 2,000분이다(Verified: GitHub 공식 플랜 문서의 Enterprise Server 판본, 확인일 2026-10-28. github.com 요금 페이지는 이 세션의 네트워크 제한으로 열지 못함). 코드 푸시 1회는 GitHub 호스팅 작업 3개, 각 1분 미만이다(Verified: ci #15). 작업마다 분 단위로 올려 세면 약 3분이다(Assumed: 올림 규칙은 이 세션에서 문서를 직접 열지 못함).
- `minimumReleaseAge`는 공급망 공격을 막는 장치라 낮추지 않는다. 기다리는 쪽(cooldown)을 늘리는 편이 안전하다.

## 결과
- 매주 PR이 몇 개 생긴다. 합치는 것은 사람(또는 사용자가 맡긴 에이전트)이 한다. 합치면 main CI가 이미지를 다시 만들어 NAS에 배포한다.
- 버전만 바뀐 변경은 작업 기록 없이 통과한다. 의존성을 올리며 코드도 고치면 코드 변경 때문에 작업 기록이 필요하다.
- pnpm·Node·Docker 이미지는 자동으로 올라가지 않는다. 보안 공지가 나오거나 관련 작업을 할 때 함께 바꿀 파일과 같이 올린다.
- 확인 못 한 것(Assumed): Dependabot이 `packageManager` 필드를 `pnpm`이라는 이름의 의존성으로 다루는지(`ignore` 동작), pnpm 11.28.9 lockfile을 문제없이 다루는지. 첫 실행 결과로 확인한다.
