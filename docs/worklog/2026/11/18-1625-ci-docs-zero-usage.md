# 문서만 바뀐 푸시는 CI를 시작하지 않음 (GitHub Actions 사용량 0)

- 일시: 2026-11-18 16:25 (KST)
- 작업 도구: Antigravity
- 관련: ADR `2026-10-28-dev-workflow.md`, 작업 기록 `15-0830-batch-1115-merge.md` "덧붙임: 문서만 바뀐 푸시의 CI 줄이기"

## 한 일
- 사용자 지시(2026-11-18): "문서 업로드만으로는 깃허브 사용량과 무관하게 하라. 기존에 문서를 올려도 코드를 전체검증하는 헛짓거리 때문에 사용량이 초과했다". 사용자가 보낸 결제 화면: 11월 Actions 사용 금액 $13.65(전부 이 저장소).
- 원인: 2026-11-15의 `changes` 단계는 문서만 바뀐 푸시에서 `pnpm check`·빌드만 건너뛰었다. 실행 자체는 생겨서 GitHub 서버에서 `check` 작업(받기·Node·`pnpm install`·문서 검사)과 `secrets` 작업(gitleaks 전체 이력)이 매번 돌았다. 작업마다 분 단위로 올림해 계산하므로 문서 푸시 하나에도 몇 분씩 썼다(Assumed: 실행 기록을 보지 못함 — 이 PC에 `gh`가 없다).
- `ci.yml`의 `push`·`pull_request` 트리거에 `paths-ignore`를 넣었다: `docs/**`, `.claude/**`, `.agent/**`, `**/*.md`. 푸시 하나에서 바뀐 파일이 모두 이 목록이면 실행이 생기지 않는다(사용량 0). 하나라도 밖이면 지금처럼 전체가 돈다. 목록은 `changes` 단계의 문서 판단식과 같다.
- `AGENTS.md` 3장: "문서만 바뀐 커밋은 다음 코드 묶음에 얹는다" 규칙을 "문서만 바뀐 푸시는 CI가 시작하지 않으니 따로 바로 올려도 된다"로 바꿨다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `.github/workflows/ci.yml` | 트리거 `paths-ignore`, 머리 주석과 문서 검사 갈래 주석 |
| `AGENTS.md` | 3장 사용량 규칙을 새 동작에 맞춤 |
| `docs/worklog/2026/11/18-1625-ci-docs-zero-usage.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- 문서로 볼 경로를 바꾸면 `ci.yml`의 `paths-ignore` 두 곳(push·pull_request)과 `changes` 단계 판단식을 함께 고친다.

## 건드리지 말 것
- `changes` 단계(마지막으로 성공한 main 실행 기준 판단)는 남겨 둔다. 문서 푸시가 실행을 만들지 않으니 다음 코드 푸시는 마지막 성공 실행부터 비교해 그 사이 코드를 빠뜨리지 않는다.

## 미검증·TODO·알려진 문제
- YAML은 js-yaml로 읽어 트리거 모양만 확인했다(Verified). 문서만 바뀐 푸시에서 실행이 생기지 않는지는 이 변경이 main에 올라간 뒤 처음 확인된다(미실행).
- 문서만 바뀐 푸시는 GitHub에서 문서 검사(`docs:index --check`·`check:docs`·`check:wiki`)와 gitleaks를 하지 않는다. 푸시 전 훅(`lefthook.yml`)이 문서 검사를, 커밋 훅이 올리는 파일의 비밀값 검사를 로컬에서 한다. 훅을 건너뛰면(`--no-verify`, GitHub 웹 편집) 아무 검사 없이 들어간다.
- 기획 미러(`docs/design/`)만 바꾸고 `pnpm settings:cells`를 빠뜨리면 `pnpm test`가 깨지는데 CI가 잡지 않는다(11-15 변경부터 같았다). 푸시 전 훅의 `pnpm check`가 잡는다.

## 사용자 결정 대기
- 코드 푸시에서 `check`·`secrets`를 로컬로 옮기고 `image`만 GitHub에서 돌릴지(대화에서 논의 중).
