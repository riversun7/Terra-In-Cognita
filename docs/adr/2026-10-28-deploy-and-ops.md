# 배포·운영(NAS, 네트워크, 백업, 관측, 비밀값)

- 상태: 확정 (일부 대체됨: 2026-10-28-nas-kernel-limits.md — CPU 상한)
- 날짜: 2026-10-28
- 관련: PLAN 9장, DECISION_LOG Round 2·9, 독립 검토 6~9·14·15

## 배경
첫 배포는 Synology NAS 1대다. 같은 NAS에 기존 버전과 다른 프로젝트 컨테이너도 있다(Verified: 사용자 제공 화면). 기존 배포는 watchtower가 이미지만 바꿔서 compose 설정 변경이 반영되지 않았고, 그 때문에 테스트 서버 장애가 났다(Verified: 2026-10-26 보고서). watchtower는 개발이 중단됐다(Verified: README). 비공개 저장소의 브랜치 보호는 유료 플랜이 필요한데 쓰지 않기로 했다.

## 결정
- 이미지: GitHub Actions에서 amd64, Debian slim 기반으로 빌드해 GHCR에 커밋 해시·버전 태그로 올린다. 에셋은 이미지에 넣지 않는다.
- 배포: NAS의 **GitHub self-hosted runner**가 `ops/deploy.sh <태그>`를 실행한다(백업 → 마이그레이션 1회 → 기동 → 헬스체크 → 실패 시 롤백). NAS 포트를 새로 열지 않는다.
- 새 스택 컨테이너에는 watchtower 제외 라벨, 고유 이름·네트워크, CPU·메모리 상한, DB 이미지 버전 고정(`postgres:18.x`).
- 기존 테스트 DB `terra_testDB`(PostgreSQL 18.6) 자리를 비우고 새 스택용으로 쓴다. 기존 테스트 서버는 함께 중지한다.
- 외부에는 HTTPS 하나(DSM 역방향 프록시 + WebSocket 헤더). DB 포트는 외부에 공개하지 않는다.
- 백업: 매일 `pg_dump` → NAS 밖 보관, 주 1회 자동 복구 검사, 마이그레이션 전 자동 백업. 실유저 단계 전 WAL 아카이브 추가.
- 관측: 구조화 로그, 서버 지표 대시보드(관리자 페이지), 기기 성능 오버레이·텔레메트리, 기기 오류 수집.
- 비밀값은 NAS에만(첫 배포 때 생성). 기존 비밀번호 교체는 정식 서비스 직전(사용자 결정).
- NAS 사양(커널, CPU, 메모리, 디스크, Docker 버전, 디스크 동기화 지연)은 runner로 자동 수집한다.

## 이유
- runner는 NAS가 GitHub로 먼저 접속하는 방식이라 인바운드 포트가 필요 없고, 작업 기록이 Actions 로그로 남는다.
- 기존 watchtower는 필터 없이 모든 컨테이너를 60초마다 갱신한다(Verified: 기존 compose) → 새 스택은 제외 라벨로 보호한다. 기존 watchtower 자체는 사용자 결정으로 그대로 둔다.
- PostgreSQL 18 이미지는 데이터 경로가 바뀌었다(Verified: 공식 Dockerfile) → 볼륨 위치를 명시한다.

## 결과
- 사용자가 NAS에 runner를 한 번 설치해야 한다(M0).
- runner는 Docker 제어 권한을 가지므로 main 브랜치 작업만 실행하도록 제한한다.
