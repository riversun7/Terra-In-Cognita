# NAS 설치 안내 (새 스택)

새 게임 서버를 NAS에 자동 배포하려면 아래를 **한 번만** 하면 된다.
기존 운영 서버(기존 버전)와 다른 프로젝트 컨테이너는 건드리지 않는다. 새 스택은 이름이 모두 `tic-`로 시작한다.

## 1. 폴더 만들기
File Station → `docker` 공유 폴더 안에 폴더를 만든다.
- `tic-runner` — 실행기(runner) 작업 폴더
- `tic-runner/config` — 실행기 등록 정보(**꼭 미리 만든다.** 실행기 이미지가 이 폴더를 스스로 만들지 않는다)
- `terra-in-cognita` — 새 DB 데이터, 배포 전 백업, 비밀값 파일(`.env`)

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

이후 main에 푸시할 때마다 검사 → 이미지 → NAS 배포가 이어진다. 바로 배포하려면 **Actions → ci → Run workflow**(main). 끄려면 값을 `false`로 바꾼다.

## 4. NAS 사양 수집 (1회)
**Actions → nas-facts → Run workflow**. 끝나면 실행 화면의 Summary에 커널·CPU·메모리·디스크·Docker 버전·디스크 동기화 속도가 나온다. 다음 작업 세션이 이 내용을 `ops/nas-facts.md`로 옮긴다.

## 5. 첫 배포 확인
- Actions의 `ci` 실행에서 `deploy`가 초록색이면 성공.
- Container Manager에서 `tic-app`, `tic-db`가 실행 중(정상)으로 보인다.
- DB 비밀번호는 첫 배포 때 자동으로 만들어져 `docker/terra-in-cognita/.env`에만 저장된다(git에는 없음).
- 배포 중 헬스체크가 실패하면 직전 버전으로 자동으로 되돌린다. 배포 전 DB 백업은 `docker/terra-in-cognita/backups`에 14일 보관한다.

## 6. 외부 접속 (주소를 정할 때 같이 설정)
앱은 NAS 안(`localhost:4100`)에만 열려 있다. 휴대폰에서 접속하려면 DSM 역방향 프록시를 만든다.
1. DSM → 제어판 → 로그인 포털 → 고급 → **역방향 프록시 → 생성**
   - 소스: HTTPS, 호스트 이름(기존 운영 주소와 다른 것), 포트(443 또는 새 포트)
   - 대상: HTTP, `localhost`, `4100`
   - 사용자 지정 머리글 → 생성 → **WebSocket** (빠뜨리면 화면은 뜨지만 "연결이 끊어졌습니다. 다시 연결하는 중…"이 반복된다)
2. 제어판 → 보안 → 인증서: 이 호스트 이름에 Let's Encrypt 인증서를 연결한다.
3. 접속 주소는 `https://riversun7.synology.me:4443`(도메인 바로 뒤에 `:4443`, 2026-10-28 설정). 이 NAS는 공유기 포트포워딩 없이도 새 포트로 바로 접속됐다(2026-10-28 확인). NAS를 다른 공유기 뒤로 옮기면 그때 포워딩을 추가한다.
4. 같은 이유로 NAS의 다른 포트(DB 5433·5439·7432 등)도 외부에서 바로 열려 있을 수 있다(추정, `ops/nas-facts.md`). 막을지 정한다.

## 7. 기존 테스트 서버 삭제 (사용자 결정 2026-10-28)
기존 버전은 운영 서버(`terra-server`, `terra-client`, `terra-postgres`, `terra-watchtower`)만 남긴다.
1. `terra_testDB`(프로젝트 없음): 컨테이너 → 중지 → 삭제. 데이터 폴더 `docker/terra-testDB`는 File Station에서 지운다.
2. `terra-test-server`(`antigravt01` 프로젝트 소속): 컨테이너 → 중지 → 삭제.
   - 프로젝트 소속이라 삭제가 막히거나, 나중에 `antigravt01` 프로젝트를 다시 빌드하면 되살아난다. 완전히 없애려면 그 프로젝트 YAML에서 `test-server:` 부분을 지운다. 다른 서비스의 `depends_on`에 `test-server`가 있으면 그 줄도 함께 지운다(남기면 빌드 실패). 저장·빌드하면 운영 컨테이너도 잠깐 다시 시작된다.
   - `docker/antigravt01` 폴더는 운영 서버가 쓰므로 지우지 않는다.
3. 기존 로그인 화면의 "테스트 서버" 선택지는 남지만 누르면 접속되지 않는다(운영 서버 선택은 그대로).

## 문제가 생기면
- **실행기가 계속 다시 시작된다**(로그에 `DISABLE_AUTOMATIC_DEREGISTRATION should be set to true`): compose에 `DISABLE_AUTOMATIC_DEREGISTRATION: "true"`가 없거나 `tic-runner/config` 폴더가 없는 것이다. 프로젝트를 중지하고 YAML을 저장소의 `ops/runner/compose.yml`로 바꾼 뒤(토큰은 새로 받아 넣는다) 다시 빌드한다.

## 참고
- 실행기는 NAS의 Docker를 제어할 수 있다. 배포 작업은 main 브랜치 실행에서만 돈다. 저장소에 쓰기 권한을 가진 사람만 작업을 실행할 수 있으니 협업자를 추가할 때 주의한다.
- 실행기를 다시 설치하려면 토큰을 새로 받아 2단계를 다시 한다.
- 관련 파일: `ops/compose.yml`(게임 서버 + DB), `ops/deploy.sh`(배포 순서), `ops/runner/compose.yml`(실행기), `.github/workflows/ci.yml`, `.github/workflows/nas-facts.yml`.
