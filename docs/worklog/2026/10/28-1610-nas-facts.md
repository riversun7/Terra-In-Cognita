# NAS 사양 수집 결과 기록

- 일시: 2026-10-28 16:10 (KST)
- 작업 도구: Claude Code (클라우드 세션)
- 관련: PLAN 9.2·4.7, ADR `2026-10-28-deploy-and-ops.md`, 이전 기록 `28-1535-runner-fix-nas-cleanup.md`

## 한 일
- 사용자가 실행기(`tic-runner`) 정상 실행을 확인한 뒤, `nas-facts` 워크플로를 GitHub에서 실행했다(1회차 성공). 실행기 `nas`가 작업을 받아 처리함을 확인.
- 결과를 `ops/nas-facts.md`에 기록하고, 계획에 주는 영향을 정리했다.
- PLAN 4.7에 디스크 동기화 측정값을 적었다. `ops/nas-setup.md` 6단계의 확인할 DB 포트 목록을 실제 값(5433·5439·7432)으로 고쳤다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `ops/nas-facts.md` | NAS 사양·컨테이너·포트 기록(PLAN 9.2) |
| `docs/PLAN.md` | 4.7: 디스크 동기화 측정 결과와 남은 결정 |
| `ops/nas-setup.md` | 6단계: 확인할 DB 포트 목록 갱신 |

## 함께 바꿔야 하는 파일
- NAS 사양이 바뀌면(디스크 교체, DSM 업데이트로 Docker 버전 변경 등) `nas-facts`를 다시 돌려 `ops/nas-facts.md`를 고친다.

## 건드리지 말 것
- 다른 프로젝트 컨테이너(`sunplant-db`, `KS-FrontierDB`, 문서 뷰어, `mac2-landing-1`)와 기존 버전 운영 컨테이너.

## 확인한 것 (Verified, 실행 결과)
- 커널 4.4.302+, CPU AMD Ryzen Embedded R1600(4스레드), 메모리 3,890MB, HDD 2개.
- Docker 엔진 24.0.2(API 1.43). 실행기 안 docker 29.9.2가 API 1.43으로 맞춰 `docker ps`까지 동작.
- fdatasync 약 77ms/회.
- `terra-test-server`, `terra_testDB`는 이미 없음(사용자 삭제). 4100 포트 사용 컨테이너 없음.

## 미검증·TODO·알려진 문제
- 커널 4.4 < Node.js 공식 지원 최소 4.18 → 첫 배포로 Node 24·PostgreSQL 18 동작을 확인한 뒤 ADR 작성(PLAN 9.2).
- 실행기 안 Compose v5.6.1과 엔진 24.0.2 조합으로 `docker compose up`이 되는지는 첫 배포에서 확인.
- 디스크 동기화가 느려 PLAN 4.7의 주문 응답 목표는 그대로는 불가 → 거래소 설계 ADR에서 결정.

## 사용자 결정 대기
- 저장소 변수 `NAS_DEPLOY_ENABLED=true` 설정(첫 배포를 위해).
- `KS-FrontierDB`(포트 7432)가 무엇인지.
- 공유기 포트 포워딩 확인(5433·5439·7432).
