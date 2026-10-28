# 서버: 믿는 프록시 범위 좁히기, 없는 파일은 404

- 일시: 2026-10-28 19:35 (KST)
- 작업 도구: Claude Code (클라우드 세션)
- 관련: 조사 `docs/research/2026-10-28-better-auth-integration.md` 3번, `docs/research/2026-10-28-pwa-and-browser-baseline.md` 버그 3번, 작업 기록 `28-1820-telemetry.md`(알려진 문제였던 것)

## 한 일
- 접속 주소(`request.ip`)
  - 전에는 `trustProxy: true`였다. 이때 서버는 `X-Forwarded-For`의 맨 앞 값을 접속 주소로 쓴다. 기기가 이 값을 위조하면 텔레메트리의 주소별 속도 제한을 피할 수 있었다(전체 상한은 유지).
  - 이제 루프백·사설 주소(`loopback, uniquelocal`)에서 온 연결만 프록시로 믿는다. 그래서 DSM 프록시가 덧붙인 실제 주소가 접속 주소가 된다.
  - 바꿀 때는 환경 변수 `TRUST_PROXY`를 쓴다(Fastify trustProxy 문자열 형식).
- 정적 파일
  - 화면 경로(확장자 없는 GET)만 `index.html`로 보낸다.
  - 없는 파일(`/assets/*.js`, `/sw.js` 등)과 `/api`, `/ws`는 404다. 전에는 없는 파일에도 HTML을 200으로 줬다. 그러면 배포 뒤 옛 화면이 스크립트 대신 HTML을 받아 형식 오류가 나고, 나중에 서비스 워커를 걷어낼 수도 없었다.
  - 그래서 화면 경로 이름에는 점(.)을 쓰지 않는다.

## 확인 (Verified)
- Fastify 5.12.7 코드: `trustProxy` 문자열은 쉼표로 나눠 `@fastify/proxy-addr`로 컴파일한다. `uniquelocal` = 10/8, 172.16/12, 192.168/16, fc00::/7. `loopback` = 127/8, ::1. 숫자로 주면 아무것도 믿지 않는다.
- 시험(`apps/server/src/app.test.ts`)
  - 사설 주소 프록시를 거친 `6.6.6.6, 203.0.113.7` → 접속 주소는 `203.0.113.7`.
  - 공인 주소에서 직접 온 머리글은 무시.
  - 화면 경로 200(HTML), 없는 `.js`·`/sw.js`·`/api` 404.
- 옛 동작으로 잠깐 되돌리면 새 시험이 실패한다: 프록시 2건, 화면 대체 1건. 원래대로 하면 9개 모두 통과.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/config.ts` | `DEFAULT_TRUST_PROXY`, `TRUST_PROXY` 환경 변수 |
| `apps/server/src/app.ts` | 믿는 프록시 범위, 화면 경로만 index.html |
| `apps/server/src/main.ts` | 설정 전달 |
| `apps/server/src/app.test.ts` | 시험 3개 추가 |

## 함께 바꿔야 하는 파일
- NAS 앞단이 바뀌면(사설 주소가 아닌 곳을 거침) `ops/compose.yml`에 `TRUST_PROXY`를 준다.

## 건드리지 말 것
- `trustProxy: true`로 되돌리지 않는다(주소 위조).

## 미검증·TODO·알려진 문제
- NAS에서 실제로 들어오는 연결 주소(Docker 게이트웨이, 사설 대역)는 추정이다(Assumed). 다른 대역이어도 위조는 막힌다. 다만 그때는 모든 기기가 한 주소로 보여 주소별 제한이 전체 제한처럼 된다. 인증 작업 때 한 번 `request.ips`를 로그로 확인한다.
- 같은 LAN 안의 기기(사설 주소)가 DSM을 거쳐 들어오면 그 주소도 프록시로 믿어 버려 앞쪽 값을 위조할 수 있다. LAN 안 위험이라 감수한다.

## 사용자 결정 대기
- 없음
