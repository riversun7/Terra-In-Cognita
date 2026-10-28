# NAS 커널 4.4 대응 (실행 환경, CPU 상한)

- 상태: 확정 (2026-10-28, 첫 배포 성공 확인 후)
- 날짜: 2026-10-28
- 관련: PLAN 9.2·9.7, `2026-10-28-deploy-and-ops.md`(CPU 상한 부분을 대체), `ops/nas-facts.md`

## 배경
NAS 사양 수집에서 커널이 4.4.302+로 나왔다(Verified: `nas-facts` 1회차). Node.js 공식 지원 최소 커널은 4.18이다(PLAN 9.2). PLAN 9.2는 이 경우 대응을 ADR로 정하기로 했다.
첫 배포에서는 앱 컨테이너 생성이 실패했다. 오류: `NanoCPUs can not be set, as your kernel does not support CPU CFS scheduler or the cgroup is not mounted`(Verified: ci 6회차 deploy 로그). 원인은 compose의 `cpus: 2`(CPU 상한)다.

## 선택지
1. 지금 NAS에서 그대로 돌리고, 문제가 생기면 다시 본다. 커널은 DSM이 정하므로 바꿀 수 없다.
2. 새 스택을 커널이 최신인 다른 장비(클라우드 VM 등)로 옮긴다.
3. Node 대신 다른 런타임을 쓴다.

## 결정
- 1번. NAS(DSM 커널 4.4)에서 Node 24·PostgreSQL 18 컨테이너를 그대로 쓴다. 근거: 수정 후 첫 배포(ci 7회차)에서 `tic-db` 헬스체크와 `tic-app` 헬스체크(`/health` 응답)가 모두 통과했다(Verified: deploy 로그 "배포 완료: sha-84c12cc63503").
- CPU 상한(`cpus`)은 쓰지 않는다. 메모리 상한(`mem_limit`)과 CPU 상대 우선순위(`cpu_shares: 512`, 기본 1024의 절반)만 둔다.

## 이유
- 커널은 Synology DSM이 정하고, 사용자가 올릴 수 없다(Assumed).
- 같은 NAS에서 기존 서버(Node 18 컨테이너)가 41시간 넘게 계속 돌고 있다(Verified: `nas-facts`의 컨테이너 상태).
- 컨테이너 안의 glibc(Debian 13)는 커널 3.2 이상이면 동작한다(Assumed: Debian glibc 빌드 설정).
- PostgreSQL 18의 기본 I/O 방식(`io_method=worker`)은 io_uring을 쓰지 않으므로 오래된 커널에서도 동작한다(Assumed: PostgreSQL 18 문서).
- CPU 상한이 없으면 새 스택이 CPU를 많이 쓸 때 기존 운영 서버가 느려질 수 있다. 우선순위를 낮춰 CPU가 모자랄 때 양보하게 한다.
- 2번은 비용이 들고, 3번은 기술스택 ADR 전체를 흔든다. 지금 단계(개발·스테이징)에서는 과하다.

## 결과
- deploy-and-ops ADR의 "CPU·메모리 상한" 중 CPU 상한 부분을 대체한다.
- 공식 지원 범위 밖이라, Node·libuv의 새 기능(새 커널 시스템 호출 등)이 문제를 일으킬 수 있다 → 배포 헬스체크와 오류 로그로 감시하고, Node 메이저 버전을 올릴 때는 NAS에서 먼저 확인한다.
- 실유저 단계 전에 NAS를 계속 쓸지, 장비를 바꿀지 다시 본다(디스크 동기화 지연 문제와 함께, `ops/nas-facts.md`).
