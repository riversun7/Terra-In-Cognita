# NAS 사양 (자동 수집)

- 수집: 2026-10-28 16:08 (KST), `nas-facts` 워크플로 실행 1회차(실행기 `nas`)
- 원본: <https://github.com/riversun7/Terra-In-Cognita/actions/runs/40648190914>
- 다시 수집하려면 Actions → nas-facts → Run workflow. 결과가 바뀌면 이 파일을 고친다.

| 항목 | 값 |
|---|---|
| 커널 | 4.4.302+ (Synology DSM) |
| CPU | AMD Ryzen Embedded R1600, 4스레드 |
| 메모리 | 3,890MB(수집 시 사용 가능 약 2,000MB), 스왑 4,383MB |
| 디스크 | `/volume1` 13TB 중 573GB 사용(5%), HDD 2개(`sata1`, `sata2`) |
| Docker | 엔진 24.0.2(API 1.43). 실행기 안의 클라이언트 29.9.2가 API 1.43으로 맞춰 동작함 |
| Compose | v5.6.1(실행기 안) |
| 디스크 동기화(`pg_test_fsync`, 8kB 1회) | fdatasync 약 13회/초(약 77ms/회), fsync 약 15회/초(약 68ms/회) |

## 컨테이너 (수집 시점)
| 이름 | 이미지 | 공개 포트 | 비고 |
|---|---|---|---|
| `tic-runner` | `myoung34/github-runner:2.338.2-ubuntu-noble` | 없음 | 새 스택 실행기 |
| `terra-server` | `ghcr.io/riversun7/antigravt01-server:latest` | 3001 | 기존 버전 운영 |
| `terra-client` | `ghcr.io/riversun7/antigravt01-client:latest` | 3000 | 기존 버전 운영 |
| `terra-postgres` | `postgres:18` | 5439 | 기존 버전 운영 DB |
| `terra-watchtower` | `containrrr/watchtower` | 없음 | 기존 버전 자동 갱신(대상 필터 없음) |
| `sunplant-db` | `postgres:latest` | 5433 | 다른 프로젝트(`sunplant26`) |
| `KS-FrontierDB` | `postgres:latest` | 7432 | 무엇인지 미확인 |
| `synology_docviewer_1`, `_2` | Synology 문서 뷰어 | 없음 | |
| `mac2-landing-1` | `mac2-landing:amd64` | — | 꺼짐(Exited 1) |

- 기존 `terra-test-server`, `terra_testDB`는 없다(사용자가 삭제함).
- 4100 포트를 쓰는 컨테이너는 없다.

## 계획에 주는 영향
- **커널 4.4**는 Node.js 공식 지원 최소(4.18)보다 낮다 → PLAN 9.2대로 대응을 ADR로 정한다. 첫 배포에서 Node 24·PostgreSQL 18이 실제로 도는지 확인한 뒤 쓴다.
- **디스크 동기화가 느리다**(1회 약 70~80ms, HDD). 동기 커밋 1건마다 이만큼 걸리므로 PLAN 4.7의 "주문 응답 서버 내부 p95 ≤ 50ms"는 건별 동기 커밋으로는 이 NAS에서 불가능하다 → 거래소 설계 때 묶음 커밋, `synchronous_commit` 설정, SSD 중에서 정한다(ADR).
- **메모리 약 4GB**(사용 가능 약 2GB) → 새 스택 상한(app 1GB, db 1GB)은 들어가지만 여유가 적다. 부하 테스트는 계획대로 NAS 밖에서 한다.
- DB 포트 5433·5439·7432가 NAS의 모든 네트워크 주소에 열려 있다 → 공유기에서 외부로 포워딩되어 있는지 확인이 필요하다(`ops/nas-setup.md` 6단계).
