# 디자인 스킬 설치와 한국어 스킬 작성

- 일시: 2026-10-28 17:10 (KST)
- 작업 도구: Claude Code (클라우드 세션)
- 관련: ADR `2026-10-28-agent-skills.md`, AGENTS.md 8장, 이전 기록 `28-1645-external-access.md`

## 한 일
- 점검: 새 저장소만 연 세션을 띄워 스킬 목록을 확인했다. 디자인·다국어·글쓰기 스킬이 없었고, 보이던 1,300여 개는 기존 저장소의 스킬 팩이었다. `grill-me`는 `disable-model-invocation: true`라서 목록에는 안 보이지만 `/grill-me`로 쓸 수 있다(정상).
- 사용자 요청(스크린샷 목록 "알아서 설치")에 따라 원본 저장소 7곳을 받아 스킬 15개를 `.claude/skills/`에 복사했다. 원본과 같음을 `diff -r`로 확인했다. 라이선스 파일이 폴더에 없던 것은 원본 저장소 루트의 `LICENSE`를 넣었다.
- 한국어 스킬 `korean-writing`을 새로 썼다.
- Antigravity용 `.agent/skills` 링크를 만들었다(`../.claude/skills`).
- 검사 도구 조정: Biome 포맷과 파일 크기 검사에서 `.claude/`, `.agent/`를 뺐다. 비밀값 검사는 폴더를 가리키는 링크를 건너뛰게 고쳤다(그대로 두면 `.agent/skills`를 파일로 읽다가 멈춤). Docker 빌드에서도 `.agent`를 뺐다.
- 문서: AGENTS.md 8장(사용 순서·안전 규칙), ADR 19, PROTECTED, THIRD_PARTY_NOTICES, PLAN 10.4·13장.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `.claude/skills/<15개>/` | 외부 디자인 스킬 설치(원본 그대로) |
| `.claude/skills/korean-writing/SKILL.md` | 한국어 글쓰기 규칙(직접 작성) |
| `.agent/skills` | Antigravity가 같은 스킬을 읽도록 링크 |
| `biome.json`, `scripts/check-file-size.mjs`, `scripts/check-secrets.mjs`, `.dockerignore` | 외부 파일을 우리 코드 검사에서 빼고, 링크 처리 |
| `AGENTS.md`, `docs/adr/2026-10-28-agent-skills.md`, `docs/PROTECTED.md`, `THIRD_PARTY_NOTICES.md`, `docs/PLAN.md` | 사용 규칙과 출처 기록 |

## 함께 바꿔야 하는 파일
- 스킬을 갱신하면 `THIRD_PARTY_NOTICES.md`의 커밋과 이 기록 형식의 새 작업 기록.
- 스킬을 더하거나 빼면 AGENTS.md 8장, ADR(새로), PROTECTED.

## 건드리지 말 것
- 외부 스킬 폴더 안의 파일(원본 그대로 유지).

## 확인한 것 (Verified)
- 원본 7곳의 커밋·라이선스(각 저장소 파일).
- 복사본 = 원본(`diff -r`, 추가한 `LICENSE` 제외).
- 이 세션에서 새 스킬이 바로 목록에 나타남(`terra-in-cognita:ui-ux-pro-max`, `korean-writing` 등).
- 비밀값 검사·파일 크기 검사·포맷 검사 통과(외부 스킬 포함 상태).

## 미검증·TODO·알려진 문제
- 푸시 뒤 새 저장소만 연 점검 세션에서 설치한 17개(외부 15 + korean-writing + grilling)가 모두 스킬 목록에 보였다(Verified: 점검 세션 2, 2026-10-28 17:10경). CI 10회차(gitleaks 포함) 통과.
- Antigravity에서 `.agent/skills` 링크로 스킬을 읽는지는 사용자 PC에서 확인이 필요하다(Assumed: 스킬 팩 안내문의 경로).
- 스킬을 실제로 써서 화면을 만든 적은 아직 없다. 디자인 시스템은 첫 화면 작업 때 정한다.
- 처음 복사할 때 라이선스 확인 명령을 잘못 써서 빈 `LICENSE` 파일 2개가 생겼고, 바로 지웠다(web-design-guidelines, react-best-practices).

## 사용자 결정 대기
- 첫 화면 작업 때 디자인 방향(색·글꼴) 후보 확인.
