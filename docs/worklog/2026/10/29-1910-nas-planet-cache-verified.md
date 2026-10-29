# NAS 행성 캐시 고침 확인(판 2 배포 뒤)

- 일시: 2026-10-29 19:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-s2-planet-lod.md`(36, 제안) "NAS에서 잰 값", 작업 기록 `2026/10/29-1405-nas-planet-cache-permission.md`, `2026/10/29-1710-s2-polish-integration.md`, 배포 sha-69364ee6dd6d(CI 87)

## 한 일
- 다듬기 통합 배포(판 2, 18:12 KST 컨테이너 시작) 뒤 `nas-metrics`와 `nas-facts`를 돌려 읽었다(Verified).
  - 굽기 18.7초(생성 18.0초), 굽기 메모리 워커 194.1MB·RSS 363.2MB, 그 뒤 RSS 261~262MB.
  - "planet cache write failed" 줄이 없다. 캐시 폴더는 1000:1000·755이고, 팩 파일(2,948,585바이트)과 목록 파일(47,986바이트)이 있다. 앱 사용자 쓰기 시험은 "쓰기 가능"이다.
- 그래서 `ops/deploy.sh`의 권한 고침(755)이 NAS에서 동작한다(Verified). 다음 배포부터는 생성기·정의가 그대로면 캐시로 켠다(Assumed: 아직 그런 배포가 없다).
- ADR 36 "NAS에서 잰 값"에 "판 2 배포 뒤" 표를 더하고, "남은 위험"·"남은 것"의 캐시 줄을 고쳤다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `docs/adr/2026-10-29-s2-planet-lod.md` | NAS 판 2 굽기·캐시 쓰기 확인 값 |
| `docs/worklog/2026/10/29-1910-nas-planet-cache-verified.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- 없음.

## 건드리지 말 것
- `pgdata`·`backups` 폴더 권한(작업 기록 29-1405와 같다).

## 미검증·TODO·알려진 문제
- 캐시로 켜기는 배포 sha-2dd483a0f918(CI 96) 뒤 확인했다: `s2_test_planet` 캐시 읽기 155.5ms, `planetCacheHits` 1(Verified, ADR 36 "NAS에서 잰 값").
- 원격 가지 `ops/nas-metrics-planet`은 main에 들어갔다. 이 환경에서 원격 가지 지우기는 403이라 남겨 둔다.

## 사용자 결정 대기
- 없음.
