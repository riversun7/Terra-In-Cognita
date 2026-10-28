# 백업·복구 훈련·되돌림 훈련 자동화, 문서만 바뀐 푸시는 배포 생략

- 일시: 2026-10-28 17:40 (KST)
- 작업 도구: Claude Code (클라우드 세션)
- 관련: PLAN 9.5·10.2·11장(M0 통과 기준), ADR `2026-10-28-deploy-and-ops.md`

## 한 일
- CI: 푸시 범위에 문서(`docs/`, `*.md`)·스킬(`.claude/`, `.agent/`)만 있으면 이미지 빌드와 배포를 건너뛴다. 수동 실행과 그 밖의 변경은 그대로 배포한다. 판정 규칙을 7가지 예로 확인했다.
- `ops/backup.sh`: 매일 `pg_dump`(사용자 지정 형식) → `backups/daily-*.dump`, 만든 파일의 목차를 바로 읽어 깨졌는지 확인, 14일 지난 것 정리. 파일 권한은 소유자만(umask 077).
- `ops/restore-check.sh`: 가장 최근 백업을 네트워크 없는 임시 PostgreSQL 컨테이너에 되살리고, 백업 목차의 표 개수와 되살린 표 개수를 비교한다. 표별 행 수도 요약에 적는다. 임시 컨테이너·폴더는 끝나면 지운다.
- `nas-backup` 워크플로: 매일 03:17 KST 백업, 매주 월요일 03:43 KST 복구 훈련, 수동 실행 가능. 배포와는 다른 동시 실행 그룹(같은 그룹이면 대기 중인 배포가 취소될 수 있음).
- `rollback-drill` 워크플로(수동): 켜지자마자 꺼지는 이미지(`drill-broken`)를 만들어 NAS에 배포하고, 배포가 실패한 뒤 직전 버전으로 healthy하게 돌아왔는지, `deployed-tag`가 그대로인지 확인한다.
- 설치 안내 8단계(백업과 훈련, NAS 밖 보관), PLAN 9.5·10.2.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `.github/workflows/ci.yml` | 문서만 바뀐 푸시는 배포 생략 |
| `ops/backup.sh`, `ops/restore-check.sh` | 백업과 복구 훈련 |
| `.github/workflows/nas-backup.yml`, `.github/workflows/rollback-drill.yml` | 정기 실행·수동 훈련 |
| `ops/nas-setup.md`, `docs/PLAN.md` | 안내와 계획 반영 |
| `ops/compose.yml` | 운영 DB 상태 확인을 TCP로(첫 기동 때의 임시 서버를 준비 완료로 착각하지 않게) |
| `ops/deploy.sh`, `.github/workflows/rollback-drill.yml` | 헬스 상태를 못 읽을 때 출력에 빈 줄이 섞이던 것 수정(판정에는 영향 없었음) |

## 함께 바꿔야 하는 파일
- DB 이름·사용자·컨테이너 이름을 바꾸면 `ops/compose.yml`, `ops/deploy.sh`, `ops/backup.sh`, `ops/restore-check.sh`를 함께.
- 원장이 생기면 `ops/restore-check.sh`에 원장 합계 검사를 더한다.

## 건드리지 말 것
- `nas-backup`의 동시 실행 그룹을 `deploy-nas`로 바꾸지 않는다(대기 중인 배포가 취소될 수 있음).

## NAS 실행 결과 (Verified, 2026-10-28)
| 항목 | 실행 | 결과 |
|---|---|---|
| 매일 백업 | nas-backup 1회차 | 성공. `daily-20261028-082656.dump`, 보관 7개 |
| 복구 훈련 | nas-backup 2회차 | 실패. PostgreSQL 이미지가 첫 기동 때 띄우는 초기화용 임시 서버(소켓만 받음)를 준비 완료로 착각해, 임시 서버가 꺼지는 순간 `pg_restore`가 접속했다("the database system is shutting down"). 준비 확인을 TCP(`-h 127.0.0.1`)로 고쳤다 |
| 복구 훈련 | nas-backup 3회차 (run 40657217061) | 성공 |
| 운영 DB 상태 확인 변경 배포 | ci #14 (run 40657205773) | 성공 |
| 되돌림 훈련 | rollback-drill 1회차 (run 40657901096) | 성공. 고장 난 버전 배포 → 101초 뒤 헬스체크 실패 → 직전 버전 `sha-162b9e7dba99`로 되돌림 → 11초 뒤 healthy, `deployed-tag` 그대로. 새 스택 앱이 멈춘 시간 약 2분. 훈련 중 배포 전 백업 `pre-drill-broken-20261028-083557.dump`가 생긴다(14일 뒤 정리) |

M0 통과 기준: 2 완료 / 0 진행 / 1 미시작 (전체 3). 배포·롤백 시연과 복구 훈련은 끝났고, "휴대폰이 HTTPS로 앱을 열고 백그라운드 복귀 후 연결 유지"는 사용자 휴대폰으로 확인해야 한다.

## 미검증·TODO·알려진 문제
- 지금 DB에는 표가 없어서 복구 훈련은 "빈 DB를 되살릴 수 있다"까지만 확인한다.
- 헬스체크 대기는 설정상 90초(2초 × 45회)지만, NAS에서는 상태 조회 시간이 더해져 101초였다.
- 출력 결함 수정(`ops/deploy.sh`, `rollback-drill.yml`)은 가짜 docker 함수로 옛 출력("빈 줄 + none")과 새 출력("none")을 비교해 확인했다. NAS 실행은 다음 배포·훈련 때 확인된다.
- NAS 밖 보관(Hyper Backup)은 사용자가 설정해야 한다.

## 사용자 결정 대기
- Hyper Backup 대상(USB·다른 NAS·클라우드).
