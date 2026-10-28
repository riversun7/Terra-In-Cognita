# 기획서 미러 첫 동기화 (GDD v4, D-001~D-138)

- 일시: 2026-10-28 22:15 (KST)
- 작업 도구: Claude Code
- 관련: 기획 결정 D-132(미러 동기화는 기술 세션이 대신한다, 사용자 선택), D-062(미러 규칙), 원본 AntiGravt01 `claude/sweet-wright-4ubb2u`@e83d621

## 한 일
- 기획 세션이 terra-in-cognita에 푸시할 수 없어서, 미러 동기화를 기술 세션이 맡았다(D-132). 원본 `docs/GDD_v4/` 10개 파일을 고치지 않고 `docs/design/`에 복사했다.
  - `git archive`로 원본 커밋에서 그대로 꺼냈다. 복사 뒤 `diff -r`로 원본과 같음을 확인했다(다른 것은 미러 정보 파일 `README.md`뿐).
  - 복사 전에 확인: AI 모델 식별자 없음, 비밀값 모양 없음(Verified: grep).
- `docs/design/README.md`: 미러 정보(원본 브랜치·커밋, 동기화 시각)와 동기화 절차를 적었다.
- `docs/PROTECTED.md`, `AGENTS.md` 2장: "이 세션에서 수정 금지"를 "내용은 고치지 않고 원본을 그대로 복사만 한다(D-132)"로 바꿨다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `docs/design/*.md`, `docs/design/40_Systems/*.md` | 기획 원본 복사(미러) |
| `docs/design/README.md` | 미러 정보와 동기화 절차 |
| `docs/PROTECTED.md`, `AGENTS.md` | 미러 동기화 주체가 바뀐 것(D-132)을 규칙에 반영 |

## 함께 바꿔야 하는 파일
- 다시 동기화할 때: `docs/design/` 전체, `docs/design/README.md`의 원본 커밋·동기화 시각, 작업 기록, `docs/WORKLOG.md`(목차).
- 기획 답을 받아 기술 계획이 바뀌면: `docs/PLAN.md` 14장(질문 상태표), 해당 ADR.

## 건드리지 말 것
- `docs/design/`의 기획 내용. 틀린 곳은 기획 세션에 알린다.
- 원본 브랜치(AntiGravt01 `claude/sweet-wright-4ubb2u`)는 읽기만 한다.

## 미검증·TODO·알려진 문제
- 기획 세션이 원본을 고칠 때마다 다시 복사해야 한다. 자동으로 알려 주는 장치는 없다. 기술 작업 전에 원본 브랜치의 최신 커밋을 미러 정보와 비교한다.
- 미러 안의 링크 일부는 AntiGravt01 경로(`docs/GDD/**` 등)를 가리킨다. 이 저장소에서는 열리지 않는다(원본 그대로 둠).

## 사용자 결정 대기
- 없음.
