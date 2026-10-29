# NAS 행성 캐시 쓰기 실패(EACCES) 원인 찾기

- 일시: 2026-10-29 14:05 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-s2-planet-lod.md`(36, 제안) "구현하며 정한 것 (통합)", 작업 기록 `2026/10/29-1250-s2-integration.md`, `2026/10/29-0918-nas-metrics.md`, 배포 sha-523f3736bdb7(CI 79)

## 한 일
- S2 배포 뒤 NAS 행성 준비 줄을 읽었다(`nas-metrics`, 짧은 브랜치 `ops/nas-metrics-planet`에서 실행 — 배포 없음).
  - 굽기는 됐다: 18.4초, 최대 RSS 355MB.
  - 캐시 쓰기는 실패했다: `EACCES: permission denied, open '/app/planet-cache/…pack.tmp-…'` → "planet cache write failed, serving from memory".
  - 그래서 NAS에서는 앱 컨테이너를 다시 만들 때(배포)마다 다시 굽는다(약 18초 동안 1차맵 "만드는 중"). 기능은 메모리로 그대로 준다.
- 배포 로그에는 `chown 1000:1000` 실패 경고가 없다. 실행기는 root이고 데이터 폴더를 같은 경로로 붙여 쓴다(`ops/runner/compose.yml`). 그래서 소유자는 1000으로 바뀌었는데도 못 쓰는 것으로 본다(Assumed).
  - 짐작: 시놀로지 공유 폴더(`/volume1/docker`)의 Windows ACL이 uid 1000(DSM 사용자가 아님)의 쓰기를 막는다(Assumed, 미확인).
- 원인을 보려고 `nas-facts`에 "데이터 폴더 권한" 항목을 더했다: 폴더 소유자·권한·inode, 확장 속성 이름(ACL 여부), 앱 컨테이너 안에서 본 같은 폴더, uid 1000 쓰기 시험(임시 파일을 만들고 바로 지운다).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `.github/workflows/nas-facts.yml` | 데이터 폴더 권한 확인(캐시 쓰기 실패 원인) |

## 함께 바꿔야 하는 파일
- 캐시 폴더 자리를 바꾸면 `ops/compose.yml`(볼륨), `ops/deploy.sh`(폴더 만들기·소유자), `Dockerfile`(`PLANET_CACHE_DIR`), `ops/nas-setup.md`를 함께 고친다.

## 건드리지 말 것
- `pgdata`·`backups` 폴더의 소유자·권한은 바꾸지 않는다(DB와 백업이 쓰고 있다).

## 미검증·TODO·알려진 문제
- 원인 확인 전이다. 확인되면 고치는 방법을 정한다(권한 바꾸기 또는 Docker 이름 볼륨).
- `ops/nas-metrics-planet` 브랜치는 main에 합친 뒤 지운다.

## 사용자 결정 대기
- 없음.
