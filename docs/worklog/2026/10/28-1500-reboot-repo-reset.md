# 리부트 계획 확정과 저장소 초기화

- 일시: 2026-10-28 15:00 (KST)
- 작업 도구: Claude Code (클라우드 세션, grill-me 스킬)
- 관련: `docs/PLAN.md` v1.1, `docs/DECISION_LOG.md`

## 한 일
- 기존 프로젝트(AntiGravt01) 전수 조사와 기술스택 최신 현황 조사(2026-10-27).
- grill-me 세션 Round 1~9로 리부트 계획을 합의하고, 독립 검토와 자체 재검토를 거쳐 계획서 v1.1을 확정.
- 이 저장소의 2025-09 프로토타입(커밋 18개, 파일 61개)을 사용자 결정으로 이력까지 삭제하고 새로 시작.
- 문서 기반을 첫 커밋으로 올림.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `README.md` | 저장소 소개와 문서 위치 |
| `AGENTS.md`, `CLAUDE.md` | 모든 에이전트 공통 지침(원본은 AGENTS.md) |
| `docs/PLAN.md` | 확정된 계획서 |
| `docs/DECISION_LOG.md` | 계획 세션 질문·답변 원문 |
| `docs/research/*.md` | 계획의 근거 조사 7종(민감 문자열 제거) |
| `docs/PROTECTED.md` | 보호 대상 목록 |
| `docs/adr/README.md`, `docs/worklog/TEMPLATE.md` | 기록 양식 |
| `docs/design/README.md` | 기획서 자리(다른 세션이 작성) |
| `.claude/skills/grill-me/`, `.claude/skills/grilling/` | 계획 세션에 쓴 스킬(MIT) |
| `.gitignore`, `.gitattributes`, `.editorconfig`, `THIRD_PARTY_NOTICES.md` | 저장소 기본 설정, 외부 코드 고지 |

## 함께 바꿔야 하는 파일
- 계획이 바뀌면 `docs/PLAN.md`와 새 ADR을 함께.

## 건드리지 말 것
- `docs/DECISION_LOG.md`, `docs/research/`, `docs/design/` (PROTECTED.md 참고).
- 기존 저장소 `riversun7/AntiGravt01`의 main(보관용, 변경하지 않기로 결정).

## 미검증·TODO·알려진 문제
- `docs/WORKLOG.md`는 지금은 손으로 쓴 목차다. M0에서 자동 생성 스크립트로 바꾼다.
- M0 남은 일: ADR 16개, 모노레포 골격, CI, 배포·백업, NAS 실행기(runner) 설치 안내.
- 기존 AntiGravt01 저장소의 작업 브랜치 `claude/peaceful-lamport-yj4zci`에도 같은 문서의 보관본이 있다(`docs/reboot-2026-10/`).

## 사용자 결정 대기
- 없음. (기존 watchtower는 사용자 결정으로 유지)
