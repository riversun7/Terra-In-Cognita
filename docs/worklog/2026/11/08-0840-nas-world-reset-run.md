# NAS 시험 세계 새로 시작 실행 (D-522)

- 일시: 2026-11-08 08:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-08-world-reset.md`, ADR `docs/adr/2026-11-07-world-layout.md`, 기획 D-522(질문 645 사용자 답 "다) 제대로 다시"), 고정본 예외 사용자 승인(2026-11-08 "같이 지움 (추천)")

## 한 일
- main 71134ab(사용자 피드백 묶음 + 세계 비우기 도구 + 시험 틈 고침)를 NAS에 배포했다(CI run 264: check·image·deploy 성공).
- GitHub Actions `world-reset`(run 1, main, 입력 `RESET-WORLD`)을 실행했다. 단계 모두 성공(약 30초):
  - 백업: `reset-20261107-233207.dump`(NAS `backups/`, 자동으로 지우지 않음)
  - 앱 컨테이너만 멈춤 → `reset-world` 트랜잭션 하나로 남길 표 밖의 public 표를 모두 비움(원장 TRUNCATE 거절 트리거 둘을 잠깐 끄고 다시 켬), 감사 기록 `world.reset`
  - 남은 표 행 예: `users` 4, `sessions` 5, `user_settings` 3, `planet_library` 1, `planet_library_versions` 2, `planet_drafts` 1, `star_systems` 1, `tuning_overrides` 1
  - 앱 다시 켬 → `/health` `{"status":"ok","db":"ok","world":"ready","worldIssues":0,"worldBootMs":5288,"contentVersion":"core@51"}`, `check-world` `{"ok":true,"problems":[]}`, 자동 점검 "core@51, db ok, 프로토콜 17" 통과
- 빈 세계에서 서버가 세계 배치(국가마다 행성 위 자기 자리)로 NPC 국가·도시·시설을 새로 심었다(부팅 5.3초).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| 이 작업 기록 | 운영 실행 기록 |

## 함께 바꿔야 하는 파일
- 없음.

## 건드리지 말 것
- 백업 파일 `reset-20261107-233207.dump`는 되돌릴 일이 없다고 확인될 때까지 둔다(되돌리기: `ops/nas-setup.md` 12장).

## 미검증·TODO·알려진 문제
- 1차맵에서 국가가 행성 곳곳에 겹치지 않게 퍼졌는지는 화면으로 보지 않았다(이 세션은 NAS 화면을 못 연다) — 사용자 확인.
- 계정은 남았지만 사이보그·유닛·건물·물건은 모두 지워져, 다시 들어가면 첫 접속 사이보그 만들기부터 한다.

## 사용자 결정 대기
- 없음.
