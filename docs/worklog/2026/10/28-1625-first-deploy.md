# 첫 NAS 배포: CPU 상한 오류 수정

- 일시: 2026-10-28 16:25 (KST)
- 작업 도구: Claude Code (클라우드 세션)
- 관련: ADR `2026-10-28-nas-kernel-limits.md`(제안), `2026-10-28-deploy-and-ops.md`, 이전 기록 `28-1610-nas-facts.md`

## 한 일
- 사용자가 저장소 변수 `NAS_DEPLOY_ENABLED=true`를 설정했다. ci를 수동 실행(6회차)해 첫 배포를 시도했다.
- 결과: `tic-db`는 만들어지고 정상(healthy)까지 됐지만, `tic-app` 생성이 실패했다. 오류 `NanoCPUs can not be set, as your kernel does not support CPU CFS scheduler`(Verified: deploy 로그). NAS 커널 4.4가 CPU 상한을 지원하지 않는다.
- 수정: `ops/compose.yml`에서 `cpus: 2`를 빼고 app·db에 `cpu_shares: 512`(상대 우선순위)를 넣었다. db 설정이 바뀌어 다음 배포에서 `tic-db`가 한 번 다시 만들어진다(데이터는 바인드 마운트라 유지).
- 수정: `ops/deploy.sh`가 앱 컨테이너 생성 실패도 되돌림 대상으로 처리한다(전에는 헬스체크 실패만). 가짜 docker로 6가지 흐름 확인(첫 배포 생성 실패 → 중단, 첫 배포 성공, 정상 배포 + 백업, 헬스체크 실패 → 되돌림, 생성 실패 → 되돌림, DB 실패 → 중단).
- 커널 4.4 대응 ADR을 "제안"으로 썼다. 첫 배포가 성공하면 확정하고, deploy-and-ops ADR에 "일부 대체됨"을 표시한다.
- 사용자 결정 기록: `KS-FrontierDB`는 다른 프로젝트로 보고 더 조사하지 않는다. `unity2605`·`sunplant26` 저장소는 이 작업과 무관하므로 쓰지 않는다(세션에서 연결을 해제하는 기능은 없음, 내려받지도 않았음).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `ops/compose.yml` | CPU 상한 제거, CPU 상대 우선순위 추가 |
| `ops/deploy.sh` | 앱 생성 실패도 되돌림 |
| `docs/adr/2026-10-28-nas-kernel-limits.md` | 커널 4.4 대응(제안) |
| `docs/PLAN.md` | 9.7 리소스 규칙, 13장 ADR 목록 |
| `ops/nas-facts.md` | CPU 상한 미지원 사실, `KS-FrontierDB` 처리 결정 |

## 함께 바꿔야 하는 파일
- 컨테이너 리소스 설정을 바꾸면 `ops/compose.yml`, `ops/nas-facts.md`(제약), ADR을 함께.

## 건드리지 말 것
- compose에 `cpus`를 다시 넣지 않는다(이 NAS에서 컨테이너 생성 실패).

## 미검증·TODO·알려진 문제
- 미실행: 수정 후 배포(이 커밋의 푸시로 자동 실행된다). Node 24가 커널 4.4에서 도는지는 그 헬스체크로 확인.
- 문서만 바꾼 커밋도 이미지 빌드와 배포를 다시 돈다. 나중에 경로 필터를 둘지 정한다.

## 사용자 결정 대기
- 외부 접속 주소(역방향 프록시) — 배포가 성공한 뒤.
