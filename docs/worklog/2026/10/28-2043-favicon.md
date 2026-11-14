# 게임 앱 임시 파비콘 추가

- 일시: 2026-10-28 20:43 (KST)
- 작업 도구: Claude Code (클라우드 세션)
- 관련: ADR `2026-10-28-pwa-and-browser-baseline.md`(제안, 아이콘 항목), 이전 기록 `28-1935-proxy-trust-static-404.md`

## 한 일
- 사용자가 브라우저 콘솔에서 `GET https://<NAS 주소>:4443/favicon.ico 404`를 봤다.
- 원인: 게임 앱에 아이콘 파일과 `<link rel="icon">`이 없다. 브라우저는 아이콘 지정이 없으면 `/favicon.ico`를 스스로 요청한다. 19:35 작업부터 서버가 없는 파일에 404를 돌려줘서 콘솔에 보이게 됐다(Verified: `apps/server/src/app.ts`). 화면·연결에는 영향이 없다.
- 사용자 요청("파비콘은 직접 만들어봐라")으로 임시 아이콘을 만들었다.
  - 그림: 앱 테마색(`#0b1020`) 둥근 사각형 위에 파스텔 행성(바다·대륙)과 궤도 정거장 고리. 기획 결정 D-063(다시 푸르러진 지구)과 D-052(궤도 정거장)에서 따왔다.
  - `favicon.svg`(원본)를 Chromium으로 16·32·48px로 렌더링하고, ImageMagick으로 세 크기를 묶어 `favicon.ico`를 만들었다.
  - 밝은 탭 배경과 어두운 탭 배경에서 16px로 확인했다. 행성과 고리를 알아볼 수 있다.
- `index.html`에 두 줄을 넣었다: ICO(`sizes="32x32"`), SVG(`type="image/svg+xml"`).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/public/favicon.svg` | 아이콘 원본(벡터). SVG 아이콘을 쓰는 브라우저용 |
| `apps/game/public/favicon.ico` | 16·32·48px 묶음. SVG 아이콘을 쓰지 않는 브라우저(사파리 등)와 `/favicon.ico` 직접 요청용 |
| `apps/game/index.html` | 아이콘 링크 2줄 |

## 함께 바꿔야 하는 파일
- 아이콘 그림을 바꾸면 `favicon.svg`를 고친 뒤 `favicon.ico`를 다시 만든다. 다시 만드는 법: SVG를 16·32·48px PNG로 렌더링하고(예: Playwright Chromium으로 `omitBackground` 스크린샷), `convert fav-16.png fav-32.png fav-48.png favicon.ico`로 묶는다.
- PWA 아이콘(192·512·maskable 512·apple-touch 180, PWA ADR)을 만들 때는 같은 `favicon.svg`에서 뽑으면 그림이 맞는다.

## 건드리지 말 것
- 서버의 404 규칙(파일처럼 보이는 경로는 없으면 404). 파비콘 404는 파일을 넣어서 해결했다.

## 미검증·TODO·알려진 문제
- 그림은 임시값이다. PWA ADR대로 디자인 시스템 ADR 때 바꾼다.
- `sizes="32x32"`로 쓴 이유는, ICO에 `sizes="any"`를 쓰면 크롬이 SVG 대신 ICO를 고른다는 보고가 있어서다(Assumed: 커뮤니티 글, 원 출처인 Evil Martians 글은 이 세션의 네트워크 허용 밖이라 열지 못함). 어느 쪽을 골라도 같은 그림이다.
- 사파리는 `rel="icon"`의 SVG를 쓰지 않는다는 자료가 있다(Assumed: 2021·2025년 제3자 글). 그래서 ICO를 함께 넣었다.
- NAS 배포 뒤 실제 브라우저 탭에서 아이콘이 보이는지는 사용자 확인이 필요하다(이 세션에서는 NAS 주소로 접속이 끊긴다).

## 사용자 결정 대기
- 없음.
