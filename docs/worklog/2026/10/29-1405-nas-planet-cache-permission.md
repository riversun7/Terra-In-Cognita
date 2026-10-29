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
- 14:08 첫 실행 결과(Verified, `nas-facts` 브랜치 실행):
  - `planet-cache`는 소유 1000:1000인데 권한이 555(`dr-xr-xr-x`)다. 그래서 소유자인 uid 1000도 쓰지 못한다(쓰기 시험 "Permission denied").
  - 같은 데이터 폴더의 `pgdata`(0:0)·`backups`(0:0)·데이터 폴더 자체(1026:100)도 모두 555다. 확장 속성 이름은 보이지 않았다(빈 목록).
  - root(실행기·DB 컨테이너 시작 스크립트)는 권한 검사를 건너뛰어서 지금까지 문제가 드러나지 않았다. DB는 공식 이미지 시작 스크립트가 데이터 폴더를 `chmod 700`·`chown`한 뒤 postgres 사용자로 쓰는 것으로 안다(Assumed, 이 세션에서 스크립트를 읽지 않음).
  - 그래서 `chmod`로 권한을 바꾸면 쓸 수 있을 것으로 본다(Assumed). 빈 시험 폴더(`perm-test`)를 만들어 chown 1000 → chmod 755 → uid 1000 쓰기를 확인하는 항목을 더했다(끝나면 지운다).
- 14:11 시험 폴더 결과(Verified, `nas-facts` 브랜치 실행): 만든 직후 555 → `chmod 0755` 뒤 755(`drwxr-xr-x`) → uid 1000이 파일을 만들었다(소유 1000:1000, 권한 644) → "쓰기 가능". 시험 폴더는 지웠다.
- 고침: `ops/deploy.sh`가 `planet-cache`에 소유자(1000)와 함께 권한 755도 준다. 앱을 바꾼 뒤 앱 사용자로 쓸 수 있는지(`test -w`) 보고, 못 쓰면 경고만 찍는다(배포는 그대로).
  - 다음 배포에서 적용된다. 이 브랜치는 문서 밖 파일(`deploy.sh`·워크플로)이 바뀌어 main에 합치면 배포가 돈다. 그래서 다음 배포 묶음(S2 다듬기)과 함께 합친다. 그 배포는 생성기를 고쳐 어차피 다시 굽는다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `.github/workflows/nas-facts.yml` | 데이터 폴더 권한 확인(캐시 쓰기 실패 원인) |
| `ops/deploy.sh` | 캐시 폴더에 권한 755도 준다. 앱을 바꾼 뒤 쓰기 가능 여부를 경고로 알린다 |
| `ops/compose.yml` | 볼륨 주석(소유자·권한) |
| `ops/nas-setup.md` | "문제가 생기면"에 캐시 쓰기 실패 대처, 9장 보는 법 |
| `docs/adr/2026-10-29-s2-planet-lod.md` | "NAS에서 잰 값" 절, "남은 위험"의 NAS 굽기·캐시 줄 |

## 함께 바꿔야 하는 파일
- 캐시 폴더 자리를 바꾸면 `ops/compose.yml`(볼륨), `ops/deploy.sh`(폴더 만들기·소유자), `Dockerfile`(`PLANET_CACHE_DIR`), `ops/nas-setup.md`를 함께 고친다.

## 건드리지 말 것
- `pgdata`·`backups` 폴더의 소유자·권한은 바꾸지 않는다(DB와 백업이 쓰고 있다).

## 미검증·TODO·알려진 문제
- 고친 `deploy.sh`는 아직 NAS에서 돌지 않았다(미실행). 다음 배포 뒤 `nas-metrics`의 행성 준비 줄에 "planet cache write failed"가 없는지, 그다음 배포에서 `planetCacheHits` 1인지 본다.
- 다른 데이터 폴더(`pgdata`·`backups`)도 555지만 root·DB 시작 스크립트가 쓰므로 그대로 둔다.
- `ops/nas-metrics-planet` 브랜치는 main에 합친 뒤 지운다.

## 사용자 결정 대기
- 없음.
