# 기획서 미러 동기화 (0596914, D-513) 및 설정 칸 목록 갱신

- 일시: 2026-11-04 00:59 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-513(원본 커밋 `0596914`), 설정 칸 49 N53·M14·P1~P4·C32·N43

## 한 일
- 사용자 결정 4건(정원 세력 웨이브·거래소 운영 온/오프 스위치, 채집·채굴 스탯 구간별 확률 개발자 페이지 수정·옛 `/admin/editor/production` 참고, 건물 비용·시간·유지비 식 티어 → 시설 레벨 확정·개발자 페이지 수정, 맨손 건물 피해 상한 없음·총량 자원 매장량과 채굴 감소 규칙 개발자 페이지 수정)을 기획 원본(AntiGravt01 `docs/GDD_v4/`, 브랜치 `claude/sweet-wright-4ubb2u`, 커밋 `0596914`)에 D-513으로 기록하고 푸시했다.
- 기획 원본 `docs/GDD_v4/`를 이 저장소 `docs/design/`에 그대로 복사해 미러를 동기화했다(`docs/design/README.md` 커밋 `0596914`·시각 갱신, `docs/PLAN.md` 14장 상태 줄 갱신).
- `49_Settings.md`에 운영 온/오프 스위치 칸 `N53`이 더해지고 `M14`·`P1~P4`·`C32`·`N43` 설명이 갱신되어 `pnpm settings:cells`로 `apps/game/src/editor/tuning/settingsCells.json`(292 → 293칸)을 다시 만들었다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `docs/design/**` | 기획 원본 `0596914`(D-513) 미러 복사 및 `README.md` 원본 커밋·시각 갱신 |
| `apps/game/src/editor/tuning/settingsCells.json` | `49_Settings.md` 변경(N53 추가 등, 293칸)을 `pnpm settings:cells`로 반영 |
| `docs/PLAN.md` | 14장 미러 기준 커밋(`0596914`, D-513)과 해결된 항목 상태 반영 |

## 함께 바꿔야 하는 파일
- `docs/design/40_Systems/49_Settings.md`가 바뀌면 `pnpm settings:cells`로 `apps/game/src/editor/tuning/settingsCells.json`을 함께 갱신한다.

## 건드리지 말 것
- `docs/design/` 본문(기획 원본의 복사본).

## 미검증·TODO·알려진 문제
- D-513의 코드 반영(맨손 건물 피해 10 상한 제거, 운영·개발자 페이지 온/오프 스위치 N53, `/admin/editor/production` 방식 채집 확률 편집기)은 별도 구현 작업으로 진행한다.

## 사용자 결정 대기
- 없음.
