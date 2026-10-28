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

## 함께 바꿔야 하는 파일
- DB 이름·사용자·컨테이너 이름을 바꾸면 `ops/compose.yml`, `ops/deploy.sh`, `ops/backup.sh`, `ops/restore-check.sh`를 함께.
- 원장이 생기면 `ops/restore-check.sh`에 원장 합계 검사를 더한다.

## 건드리지 말 것
- `nas-backup`의 동시 실행 그룹을 `deploy-nas`로 바꾸지 않는다(대기 중인 배포가 취소될 수 있음).

## 미검증·TODO·알려진 문제
- 미실행: NAS에서 백업·복구 훈련·되돌림 훈련(이 커밋 푸시 뒤 수동 실행으로 확인한다).
- 지금 DB에는 표가 없어서 복구 훈련은 "빈 DB를 되살릴 수 있다"까지만 확인한다.
- NAS 밖 보관(Hyper Backup)은 사용자가 설정해야 한다.

## 사용자 결정 대기
- Hyper Backup 대상(USB·다른 NAS·클라우드).
