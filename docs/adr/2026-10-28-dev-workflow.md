# 개발 방식(트렁크 기반, 기록 체계, 훅·CI, 에이전트 규칙)

- 상태: 확정
- 날짜: 2026-10-28
- 관련: PLAN 10장, DECISION_LOG Round 3·4·9, 독립 검토 18·19

## 배경
1인 개발자가 여러 AI 에이전트(Claude Code, Antigravity, Gemini CLI)와 일한다. 기존 프로젝트는 문서가 방치됐고(봇이 "완료"로 문자열 치환), 거대 파일이 생겼고(최대 4,765줄), 에이전트 로그·외부 스킬 팩이 저장소에 쌓였다(Verified: `docs/research/`). 브랜치 보호는 유료라 쓰지 않는다(사용자, Round 9).

## 결정
- **트렁크 기반**: 기본은 main에서 바로 작업. 병렬 큰 작업만 짧은 브랜치. main CI 실패는 최우선 수정.
- 훅: commit-msg(Conventional Commits), pre-commit(포맷·비밀값), pre-push(린트·타입·단위 테스트·모듈 경계·파일 크기·문서 갱신). CI는 main 푸시마다 전체 + 이미지 + 스테이징, 야간에 E2E·생성기 해시·복구·성능.
- 기록: 작업마다 worklog 파일 1개(충돌 없음) + 자동 목차, ADR은 날짜-슬러그 파일명이고 확정 후 수정 금지, CHANGELOG는 git-cliff로 태그 때 생성, 게임 전체 하나의 SemVer.
- 새 런타임 의존성은 ADR 필수, 버전 정확히 고정.
- 지침은 `AGENTS.md` 하나, `CLAUDE.md`는 `@AGENTS.md`로 불러온다.
- 주석 한국어, 이름 영어, 파일명 영문.
- 모듈 경계는 dependency-cruiser로, 파일 크기는 600줄 경고·1,000줄 실패.

## 이유
- 여러 에이전트가 한 파일(WORKLOG.md)을 동시에 고치면 매번 충돌한다 → 파일을 나눈다.
- 커밋 훅이 무거우면 에이전트가 우회한다 → 커밋 단계는 가볍게, 무거운 검사는 pre-push와 CI로.
- 사람이 지켜야 하는 규칙은 방치된다 → 가능한 것은 도구로 강제한다.
- Claude Code는 `CLAUDE.md`의 `@` import를 지원한다(Verified: Claude Code 문서). Antigravity는 `AGENTS.md`를 읽는 것으로 알려져 있다(Assumed: 3차 출처).

## 결과
- main 직접 푸시를 막는 장치가 없다 → pre-push 훅과 "CI 실패 최우선 수정" 규칙에 의존한다.
