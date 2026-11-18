# NAS 설치 안내 (새 스택)

새 게임 서버를 NAS에 자동 배포하려면 아래를 **한 번만** 하면 된다.
기존 운영 서버(기존 버전)와 다른 프로젝트 컨테이너는 건드리지 않는다. 새 스택은 이름이 모두 `tic-`로 시작한다.

## 1. 폴더 만들기
File Station → `docker` 공유 폴더 안에 폴더를 만든다.
- `tic-runner` — 실행기(runner) 작업 폴더
- `tic-runner/config` — 실행기 등록 정보(**꼭 미리 만든다.** 실행기 이미지가 이 폴더를 스스로 만들지 않는다)
- `terra-in-cognita` — 새 DB 데이터, 배포 전 백업, 비밀값 파일(`.env`). 1차맵 행성 타일 캐시(`planet-cache`)는 배포가 만든다(지워도 된다: 앱이 다시 굽는다)

## 2. 실행기(runner) 설치
실행기는 NAS가 GitHub에 먼저 접속해서 배포 작업을 받아 오는 프로그램이다. 공유기 포트를 새로 열 필요가 없다.

1. GitHub 저장소 → **Settings → Actions → Runners → New self-hosted runner** → Linux, x64.
2. 화면의 `./config.sh --url ... --token XXXXX` 줄에서 **토큰(XXXXX)** 만 복사한다. 토큰은 1시간만 유효하니 바로 다음 단계를 한다.
3. Container Manager → **프로젝트 → 생성**
   - 프로젝트 이름: `tic-runner`, 경로: `docker/tic-runner`
   - "docker-compose.yml 만들기"를 고르고, 저장소의 `ops/runner/compose.yml` 내용을 붙여넣는다.
   - `여기에_토큰_붙여넣기`를 복사한 토큰으로 바꾸고 실행한다.
4. GitHub의 Runners 목록에 `nas`가 **Idle**로 보이면 성공이다. 등록 정보는 `docker/tic-runner/config`에 저장돼서 NAS를 다시 켜도 다시 등록하지 않는다.

## 3. 자동 배포 켜기
GitHub 저장소 → **Settings → Secrets and variables → Actions → Variables 탭 → New repository variable**
- 이름: `NAS_DEPLOY_ENABLED`, 값: `true`

이후 main에 코드·설정을 푸시할 때마다 이미지 빌드(`image`) → NAS 배포(`deploy`)가 이어진다(문서·스킬만 바뀐 푸시는 CI가 시작하지 않고, 코드·문서·콘텐츠·마이그레이션 검사는 작업 PC의 `pre-push` 훅에서 한다). 바로 배포하려면 **Actions → ci → Run workflow**(main). 끄려면 값을 `false`로 바꾼다.

## 4. NAS 사양 수집 (1회)
**Actions → nas-facts → Run workflow**. 끝나면 실행 화면의 Summary에 커널·CPU·메모리·디스크·Docker 버전·디스크 동기화 속도가 나온다. 다음 작업 세션이 이 내용을 `ops/nas-facts.md`로 옮긴다.

## 5. 첫 배포 확인
- Actions의 `ci` 실행에서 `deploy`가 초록색이면 성공.
- Container Manager에서 `tic-app`, `tic-db`가 실행 중(정상)으로 보인다.
- DB 비밀번호와 로그인 쿠키 비밀값(`BETTER_AUTH_SECRET`)은 첫 배포 때 자동으로 만들어져 `docker/terra-in-cognita/.env`에만 저장된다(git에는 없음). 이미 있는 `.env`에 빠진 키만 덧붙이고, 있는 값은 바꾸지 않는다.
- 배포 중 헬스체크가 실패하면 직전 버전으로 자동으로 되돌린다. 배포 전 DB 백업은 `docker/terra-in-cognita/backups`에 14일 보관한다.
- DB 구조 변경(마이그레이션)은 배포 로그에 `마이그레이션 적용: …` 또는 `적용할 마이그레이션 없음`으로 나온다. 실패하면 앱을 바꾸지 않고 멈춘다.
- healthy가 된 뒤 자동 점검을 한다(`ops/smoke.mjs`): `/health`의 DB 상태·콘텐츠 버전·해시, 정적 파일·PWA 응답(`/`, `/manifest.webmanifest`, `/sw.js`, 없는 파일 404), WebSocket 접속이 되는지. 배포 로그에 `✓ 배포 점검 통과 — core@1 (…)`이 나오면 성공이다. 실패하면(`✗ 배포 점검 실패: …`) 직전 버전으로 되돌린다.
- 콘텐츠 팩은 이미지 안에 있다(`/app/content/core`). 팩이 틀리면 앱이 뜨지 않고(로그에 `✗ [스키마] …`, `콘텐츠 팩 검증 실패`) 직전 버전으로 되돌린다. 지금 실행 중인 팩은 `/health`의 `contentVersion`·`contentHash`로 본다: `docker exec tic-app node -e "fetch('http://127.0.0.1:4100/health').then(r=>r.text()).then(console.log)"`

## 6. 외부 접속 (주소를 정할 때 같이 설정)
앱은 NAS 안(`localhost:4100`)에만 열려 있다. 휴대폰에서 접속하려면 DSM 역방향 프록시를 만든다.
1. DSM → 제어판 → 로그인 포털 → 고급 → **역방향 프록시 → 생성**
   - 소스: HTTPS, 호스트 이름(기존 운영 주소와 다른 것), 포트(443 또는 새 포트)
   - 대상: HTTP, `localhost`, `4100`
   - 사용자 지정 머리글 → 생성 → **WebSocket** (빠뜨리면 화면은 뜨지만 "연결이 끊어졌습니다. 다시 연결하는 중…"이 반복된다)
2. 제어판 → 보안 → 인증서: 이 호스트 이름에 Let's Encrypt 인증서를 연결한다.
3. 접속 주소는 `https://<NAS 주소>:4443`(도메인 바로 뒤에 `:4443`, 2026-10-28 설정). 이 NAS는 공유기 포트포워딩 없이도 새 포트로 바로 접속됐다(2026-10-28 확인). NAS를 다른 공유기 뒤로 옮기면 그때 포워딩을 추가한다.
4. 같은 이유로 NAS의 다른 포트(DB 5433·5439·7432 등)도 외부에서 바로 열려 있을 수 있다(추정, `ops/nas-facts.md`). 막을지 정한다.

## 7. 기존 테스트 서버 삭제 (사용자 결정 2026-10-28)
기존 버전은 운영 서버(`terra-server`, `terra-client`, `terra-postgres`, `terra-watchtower`)만 남긴다.
1. `terra_testDB`(프로젝트 없음): 컨테이너 → 중지 → 삭제. 데이터 폴더 `docker/terra-testDB`는 File Station에서 지운다.
2. `terra-test-server`(`antigravt01` 프로젝트 소속): 컨테이너 → 중지 → 삭제.
   - 프로젝트 소속이라 삭제가 막히거나, 나중에 `antigravt01` 프로젝트를 다시 빌드하면 되살아난다. 완전히 없애려면 그 프로젝트 YAML에서 `test-server:` 부분을 지운다. 다른 서비스의 `depends_on`에 `test-server`가 있으면 그 줄도 함께 지운다(남기면 빌드 실패). 저장·빌드하면 운영 컨테이너도 잠깐 다시 시작된다.
   - `docker/antigravt01` 폴더는 운영 서버가 쓰므로 지우지 않는다.
3. 기존 로그인 화면의 "테스트 서버" 선택지는 남지만 누르면 접속되지 않는다(운영 서버 선택은 그대로).

## 8. 백업과 훈련 (자동)
- **매일 03:17**: DB 백업 → `docker/terra-in-cognita/backups/daily-*.dump`(14일 보관). 배포 직전 백업은 `pre-*.dump`.
- **매주 월요일 03:43**: 복구 훈련. 가장 최근 백업을 임시 DB에 되살려 표 개수를 비교한다. 실패하면 GitHub 알림 메일이 온다.
- 바로 실행하려면 Actions → **nas-backup** → Run workflow(`backup` 또는 `restore-check`).
- **되돌림 훈련**: Actions → **rollback-drill** → Run workflow. 일부러 고장 난 버전을 배포해 직전 버전으로 돌아오는지 확인한다(약 2분간 새 스택 앱이 멈춘다).
- **NAS 밖 보관(해 주실 일)**: 백업이 NAS 안에만 있으면 NAS가 고장 날 때 같이 잃는다. DSM → Hyper Backup → 백업 작업 생성 → 대상(USB·다른 NAS·클라우드) → 폴더 `docker/terra-in-cognita/backups` → 매일.

## 9. 관측 (보는 법)
- 한 번에 보기: Actions → **nas-metrics** → Run workflow(최근 몇 분). 서버 1분 지표, 컨테이너 CPU·메모리, 행성 준비 줄(컨테이너 시작 뒤 전체), 서버 경고·오류 로그, 기기 성능·오류를 Summary에 모아 보여 준다(읽기만 한다). 앱 컨테이너를 다시 만들면(배포) 그 전의 서버 지표·로그 줄은 없어진다. 기기 표는 DB에 남는다.
- 서버 지표(1분마다 로그 한 줄: 이벤트 루프 지연, 메모리, 접속 수, CPU %(코어 하나 기준, 워커 스레드 포함)): `docker logs tic-app 2>&1 | grep '"metric":"server"' | tail -5`
- 행성 굽기·캐시(시작할 때 한 줄: 굽기 시간·단계별 시간·최대 메모리·타일 수·크기 또는 캐시 읽기 시간, 1분 지표의 `planet*` 값): `docker logs tic-app 2>&1 | grep '"msg":"planet ready"'`
- 기기 오류: `docker exec tic-db psql -U terra -d terra -c "select received_at, kind, message, page from client_errors order by id desc limit 20"`
- 기기 성능 요약: `docker exec tic-db psql -U terra -d terra -c "select received_at, fps, frame_p95_ms, long_frames, memory_mb, device from client_perf_samples order by id desc limit 20"`
- 관리자 화면이 생기면 이 내용을 화면에서 본다(PLAN 9.5).

## 10. 계정 만들기와 역할 (관리 명령)
로그인 아이디는 영문·숫자·_ 3~20자(대소문자 무시)다. 플레이어는 게임 화면에서 없는 아이디로 들어가면 스스로 계정을 만든다. 관리자 계정·역할·비밀번호는 아래 수동 작업으로 바꾼다(결정: `docs/adr/2026-10-28-auth-and-accounts.md`).

1. GitHub 저장소 → **Actions → account-admin → Run workflow** (브랜치는 `main`).
2. 입력값
   - `command`: `create-user`(계정 만들기) / `set-roles`(역할 바꾸기) / `set-password`(비밀번호 바꾸기)
   - `login_id`: 로그인 아이디
   - `roles`: 쉼표로 이은 역할(`player`, `gm`, `dev`, `admin`). 예: 관리자는 `player,admin`. `set-password`에서는 쓰지 않는다
   - `password`: `create-user`·`set-password`에서만. 로그에는 `***`로 가려진다
   - `allow_weak`: 비밀번호 규칙(8자 이상, 아이디와 다름, 흔한 비밀번호 아님)을 건너뛴다. 로그에 경고가 남는다
3. 결과는 실행 로그 마지막 줄에 나온다. 예: `계정을 만들었습니다: <아이디> (id …, 역할 player,admin)`, `역할을 바꿨습니다: <아이디> player → player,admin`, `비밀번호를 바꿨습니다: <아이디> (끊은 세션 N개)`.
   - 실패: `✗ 이미 있는 아이디입니다`, `✗ 없는 아이디입니다`, `✗ 마지막 admin의 admin 역할은 뺄 수 없습니다`, `✗ 비밀번호가 규칙에 맞지 않습니다(…)`.
4. 모든 실행은 감사 기록에 남는다(실행자 `github:<계정>:run <번호>`). 보기:
   `docker exec tic-db psql -U terra -d terra -c "select at, actor_kind, action, target_id, after, meta from audit_log order by id desc limit 20"`
- 같은 일을 NAS에서 직접 하려면(비밀번호는 환경 변수로만): `docker exec -e TIC_PASSWORD='<비밀번호>' -e TIC_ACTOR='nas:<이름>' tic-app node dist/cli.js create-user --id <아이디> --roles player,admin` (DSM 작업 기록에 비밀번호가 남을 수 있어 GitHub 작업을 권한다)
- 관리자 화면(게임 앱 안 메뉴)이 생기면 역할 바꾸기는 화면에서 한다. 마지막 admin의 admin 역할은 뺄 수 없다.
- 새 아이디 가입을 닫으려면 `docker/terra-in-cognita/.env`에 `AUTH_OPEN_SIGNUP=false`를 넣고 다시 배포한다(있는 계정은 그대로 들어간다).
- 로그인 쿠키 비밀값 `BETTER_AUTH_SECRET`은 첫 배포 때 `.env`에 자동으로 생긴다. 바꾸면 모든 사용자의 로그인이 풀린다.

## 11. 프록시 경로 확인 (인증을 켠 뒤 한 번)
접속 주소(시도 제한·세션 기록에 쓰는 주소)가 DSM 프록시를 지나 제대로 잡히는지 본다. 서버를 켠 뒤 첫 로그인·세션 요청에서 한 번만 로그를 남긴다.
1. 휴대폰(LTE 등 NAS 밖)에서 게임 화면을 열어 로그인하거나 새로고침한다.
2. `docker logs tic-app 2>&1 | grep proxyCheck | tail -1`
3. 보는 것: `remoteAddress`는 Docker 게이트웨이 같은 사설 주소(예: `172.x.x.x`), `forwardedFor`에 휴대폰의 공인 주소, `ip`가 그 공인 주소면 정상이다.
   - `ip`가 사설 주소로 나오면 모든 기기가 한 주소로 보인다(주소별 제한이 전체 제한처럼 된다).
   - `forwardedFor`가 비어 있으면 DSM 프록시가 머리글을 붙이지 않는 것이다. 6장의 사용자 지정 머리글에서 X-Forwarded-For 설정을 본다.
   - `forwardedFor`에 공인 주소가 있는데 `ip`가 사설 주소면, 로그의 `remoteAddress` 대역을 믿도록 `ops/compose.yml`의 app 환경에 `TRUST_PROXY`(예: `loopback, uniquelocal, <대역>`)를 넣는다(작업 기록 `docs/worklog/2026/10/28-1935-proxy-trust-static-404.md`).
4. 확인한 날짜와 결과를 작업 기록에 적는다.

## 12. 시험 세계 새로 시작 (계정은 남김)
NAS 시험 세계(세력·도시·유닛·원장·사이보그 등)를 모두 지우고, 앱을 다시 켜서 세계를 새로 만든다(사용자 결정 645 다, `docs/adr/2026-11-08-world-reset.md`). 계정·로그인 세션·계정 설정·감사 기록·개발 도구 자료(행성 보관함·항성계·설정 칸·편집기 저장)·기기 기록은 남는다. 플레이어는 다음 로그인 때 사이보그를 새로 만든다.

1. GitHub 저장소 → **Actions → world-reset → Run workflow** (브랜치는 `main`), `confirm`에 `RESET-WORLD`를 정확히 적는다. 배포 중이면 배포가 끝난 뒤 돈다.
2. 하는 일: 새 백업 `docker/terra-in-cognita/backups/reset-<시각>.dump`(실패하면 멈춤) → 앱(`tic-app`)만 멈춤(DB는 그대로) → 같은 이미지의 새 컨테이너로 `node dist/cli.js reset-world --confirm RESET-WORLD`(트랜잭션 하나, 감사 기록 `world.reset`) → 앱 다시 켬(앞이 실패해도) → healthy·`/health` 월드 ready·불변 조건(`check-world`)·자동 점검.
3. 결과는 실행 화면 Summary에 나온다: 백업 파일 이름, 지운 표 수·행 수(펼치면 표별), 헬스.
   - `✗ 같은 DB에 다른 연결이 N개 있습니다`: 앱이 멈추지 않았거나 다른 접속(백업·psql)이 있다. 아무것도 지우지 않았고 앱은 다시 켜졌다. 그 접속이 끝난 뒤 다시 실행한다.
   - 미리 보기(바꾸지 않음): `docker exec tic-app node dist/cli.js reset-world --dry-run` — 지울 표·남길 표와 지금 행 수.
4. 옛 세계로 되돌리기(DB 전체가 백업 때로 돌아간다 — 그 뒤 만든 계정도 사라진다):
   1. `docker stop tic-app`
   2. `docker exec tic-db psql -U terra -d postgres -c "drop database terra"` 다음 `docker exec tic-db psql -U terra -d postgres -c "create database terra"`
   3. `docker exec -i tic-db pg_restore -U terra -d terra --no-owner --exit-on-error < /volume1/docker/terra-in-cognita/backups/reset-<시각>.dump`
   4. 백업 뒤 배포가 있었으면 마이그레이션: 저장소 폴더에서 `TERRA_TAG=$(cat /volume1/docker/terra-in-cognita/deployed-tag) docker compose -p tic -f ops/compose.yml --env-file /volume1/docker/terra-in-cognita/.env run --rm --no-deps app node dist/migrate.js`
   5. `docker start tic-app`
- `reset-*.dump`는 자동으로 지우지 않는다(계정 비밀번호 해시가 들어 있다). 필요 없어지면 File Station에서 지운다.
- 실제 플레이어가 생기기 전까지만 쓰는 도구다(ADR "다시 볼 조건").

## 문제가 생기면
- **실행기가 계속 다시 시작된다**(로그에 `DISABLE_AUTOMATIC_DEREGISTRATION should be set to true`): compose에 `DISABLE_AUTOMATIC_DEREGISTRATION: "true"`가 없거나 `tic-runner/config` 폴더가 없는 것이다. 프로젝트를 중지하고 YAML을 저장소의 `ops/runner/compose.yml`로 바꾼 뒤(토큰은 새로 받아 넣는다) 다시 빌드한다.

- **행성 캐시를 쓰지 못한다**(로그에 `planet cache write failed`, `EACCES`, 배포 로그에 "행성 캐시 폴더에 쓰지 못합니다"): 시놀로지 공유 폴더 아래 새 폴더는 root가 만들어도 권한이 555(쓰기 없음)다. `deploy.sh`가 `planet-cache`에 소유자 1000과 권한 755를 준다. 손으로 고치려면 SSH에서 `sudo chown 1000:1000 /volume1/docker/terra-in-cognita/planet-cache && sudo chmod 755 /volume1/docker/terra-in-cognita/planet-cache`. 확인은 Actions → **nas-facts**의 "데이터 폴더 권한". 앱은 캐시 없이도 돈다(다시 켤 때마다 약 18초 굽는다).

## 참고
- 실행기는 NAS의 Docker를 제어할 수 있다. 배포 작업은 main 브랜치 실행에서만 돈다. 저장소에 쓰기 권한을 가진 사람만 작업을 실행할 수 있으니 협업자를 추가할 때 주의한다.
- 실행기를 다시 설치하려면 토큰을 새로 받아 2단계를 다시 한다.
- 관련 파일: `ops/compose.yml`(게임 서버 + DB), `ops/deploy.sh`(배포 순서), `ops/smoke.mjs`(배포 자동 점검), `ops/runner/compose.yml`(실행기), `.github/workflows/ci.yml`, `.github/workflows/nas-facts.yml`, `.github/workflows/nas-metrics.yml`(지표 보기), `.github/workflows/account-admin.yml`(계정 관리), `.github/workflows/world-reset.yml`(시험 세계 새로 시작).
