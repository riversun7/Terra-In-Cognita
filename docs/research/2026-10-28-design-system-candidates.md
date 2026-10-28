> 조사 보고서 원본 (작성: Claude Code 디자인 서브에이전트, 2026-10-28). 저장소는 고치지 않고 세션 임시 폴더(scratchpad)에 시안을 만들었다(후보 3개 × 모드 4개 × 화면 5개, 영어 확인 포함 PNG 72장). 시안 그림과 그림을 만든 코드는 저장소에 넣지 않았다(PLAN 9.8). 보고서 안의 `/tmp/...` 경로는 그 세션의 임시 폴더라서 지금은 없을 수 있다. 결정은 ADR `docs/adr/2026-10-28-design-system.md`.

# 디자인 시스템 후보 3개와 세 번째 모드 (2026-10-28)

## 사용자 결정 (2026-10-28, 원문)
- 요구(화면 작업 중에 받음): "참고로 설정 페이지에서 일반적인 파스텔모드, 다크모드, 또 다른 모드 등을 선택할 수 있다."
- 순서: "화면은 임시 모양으로 먼저, 디자인은 따로 (Recommended)"
- 후보: "A 새싹 장난감 (Recommended)"
- 세 번째 모드: "선명 + 정거장 둘 다 지금"
- 처음 테마: "늘 파스텔 (Recommended)"
  - 질문에 적은 설명: "기획 톤(밝은 파스텔이 기본)을 모두가 처음 봅니다. 기기가 고대비를 요청하면 '선명'만 자동으로 고릅니다. 설정에 '기기 설정에 맞추기' 스위치를 둡니다."
- 테마 저장: "기기 + 계정 둘 다 (Recommended)"
  - 질문에 적은 설명: "기기에 저장해 바로 보이고, 로그인하면 계정 설정(서버)에도 저장합니다. 다른 기기나 저장소가 지워진 뒤에도 같은 테마가 됩니다. 언어 선택도 같은 방식으로 둡니다."
- 보고서의 질문 5(글꼴 용량)와 6(나눔스퀘어라운드 라이선스)은 묻지 않았다. 5는 아래 추가 확인을 보고 메인 세션이 ADR에서 정했다. 6은 C를 고르지 않아 필요 없어졌다.

## 메인 세션 추가 확인 (2026-10-28)
보고서의 글꼴 배포 제안(Jua는 빌드 때 줄여 미리 캐시)을 그대로 쓸 수 있는지 꾸러미 파일을 직접 봤다.

크기는 바이트를 1,000으로 나눈 KB다.

| 항목 | 결과 | 근거 |
|---|---|---|
| `pretendard` 1.3.9 | 2023-11-05 공개(최신), OFL-1.1, 예약 이름 "Pretendard". 압축 72,081,687바이트(풀면 약 97MB). `exports` 없음(깊은 경로로 가져올 수 있음). 설치 스크립트 없음 | Verified: npm 레지스트리, 꾸러미 `package.json`·`dist/LICENSE.txt` |
| Pretendard KS X 1001 부분 집합(제작자 배포) | `dist/web/static/woff2-subset/` Regular 267,096 · Medium 268,324 · SemiBold 268,752 · Bold 270,784바이트. 4개 합 약 1.07MB | Verified: 꾸러미 파일 목록 |
| Pretendard 조각(dynamic subset) | 굵기마다 92조각. Regular 조각 전부 1,162,108바이트. 지금 메시지(ko·en, 한글 197음절)만으로 굵기마다 14조각·약 162KB. 가변 글꼴 조각은 14조각·약 368KB | Verified: 꾸러미 CSS의 `unicode-range`와 `apps/game/messages/*.json`으로 계산 |
| `@fontsource/pretendard` 5.3.0 | 굵기마다 전체 글꼴 한 파일(Regular woff2 765,892바이트 = 원본 전체 글꼴과 같은 크기). 부분 집합 없음 | Verified: 꾸러미 파일 목록 |
| `@fontsource/jua` 5.3.0 | 2026-07-19 공개, OFL-1.1, 예약 이름 없음(저작권 줄만 있음). 조각 87개(`unicode-range`), woff2 88개 합 1,242,348바이트. 큰 조각(자주 쓰는 글자)은 약 27~30KB | Verified: 꾸러미 `LICENSE`·`400.css`·파일 목록 |
| Jua로 지금 제목 그리기 | 제목 키 6개(`app_title`, `*_title`)의 글자 49개 → 6조각·약 147KB. 메시지 전체라면 15조각·약 355KB | Verified: 이 세션 계산 |
| Jua 원본 TTF | npm에 없다(Fontsource는 조각만). google/fonts의 `Jua-Regular.ttf`는 2,119,352바이트 | Verified: 보고서, 내려받은 파일 |
| 이미지 빌드 위치 | `ci` 워크플로의 `image` 작업은 GitHub 실행기(ubuntu-24.04)에서 돈다. NAS는 만든 이미지를 받기만 한다 | Verified: CI #36 작업 목록 |
| 서버 정적 파일 캐시 | `@fastify/static` 기본값(`Cache-Control: public, max-age=0`). 해시 이름인 `/assets/*`도 매번 다시 확인한다 | Verified: `apps/server/src/app.ts`(옵션 없음), 플러그인 기본값은 Assumed |

## 보고서 원본

### 결과
디자인 시스템 후보 3개를 만들었습니다. 모두 4가지 모드(파스텔, 다크, 선명, 정거장)로 화면 5개씩 그렸고, 영어 확인 화면을 더해 PNG는 72장입니다. 추천은 **후보 A(새싹 장난감) + 세 번째 모드 "선명"**입니다. 저장소는 건드리지 않았습니다. 결과물은 모두 scratchpad에만 있습니다.

### 후보 3개
| | A 새싹 장난감 | B 하얀 정거장 | C 구름 지도 |
|---|---|---|---|
| 콘셉트 | 장난감 상자에서 꺼낸 들판. 버튼 아래에 턱이 있어 누르면 들어가고, 제목 글꼴이 굵고 둥글다 | 정거장 창가에서 내려다본 푸른 지구. 진주색 판, 청록 금속, 가는 선 | 구름 위에서 펼친 그림책 지도. 새벽 하늘빛, 조약돌 모양 판 |
| D-063·D-064와 맞는 정도 | 가장 잘 맞음(메이플·라그 느낌, 파비콘의 초록·금색과 같음) | 정거장 설정(D-070)과는 맞음. 다만 D-063이 버린 "차가운 하이테크"에 가깝다 | 나우시카·라퓨타의 하늘(D-063 참고작). 귀엽지만 보라색이 파비콘에 없다 |
| 팔레트(파스텔) | 하늘 `#dff2fb`, 잎색 버튼 `#8ed97f` + 짙은 글자 `#14361b`, 해 `#ffd66e` | 진주 `#eef4f6`, 청록 `#0f7476` + 흰 글자, 연보라 장식 | 라벤더 `#e4defe`→살구, 보라 `#6a52cc` + 흰 글자 |
| 글꼴 | 제목 Jua, 본문 Pretendard | SUIT 하나 | 나눔스퀘어라운드 하나 |
| 대비(AA) | 전부 통과 | 전부 통과 | 전부 통과 |
| 글꼴 용량(KS X 1001, woff2) | 약 562KB(Jua 183 + Pretendard R·B 188·191) | 약 410KB(R·B·EB 135·137·138) | 약 350KB(R·B·EB 117·122·111) |
| 비용·위험 | 글꼴 2개. 거래창·관리자처럼 촘촘한 화면에는 "촘촘" 변형이 필요하다(턱 0, 모서리 작게) | 가장 싸고 읽기 쉽다. 대신 귀여운 느낌은 그림이 다 맡아야 한다 | 가장 싸다. 라이선스는 **추정**이다(아래 참고). 2017년 v1.000 뒤로 갱신이 없다 |

### 대비 (WCAG 2.x, 계산함 = Verified)
기준은 글자 4.5:1, 선명 모드 글자 7:1, 초점 표시와 입력칸 테두리 3:1입니다.

| 후보·모드 | 글자/바탕 | 흐린 글자/바탕 | 버튼 글자/버튼 | 위험/바탕 | 흐린 글자 최저(모든 판·그라데이션) |
|---|---|---|---|---|---|
| A 파스텔 | 11.23 | 5.82 | 7.87 | 5.34 | 5.60 |
| A 다크 | 14.78 | 8.22 | 7.87 | 7.27 | 6.08 |
| A 선명 | 18.45 | 11.30 | 7.54 | 7.01 | 10.06 |
| A 정거장 | 16.58 | 9.56 | 10.12 | 8.11 | 5.29 |
| B 파스텔 | 14.19 | 5.75 | 5.56 | 4.96 | 5.42 |
| B 다크 | 15.30 | 7.87 | 8.51 | 7.95 | 6.00 |
| B 선명 | 19.15 | 11.99 | 8.69 | 7.01 | 10.55 |
| B 정거장 | 16.85 | 9.54 | 10.12 | 8.25 | 5.48 |
| C 파스텔 | 11.08 | 5.32 | 5.69 | 5.12 | 5.32 |
| C 다크 | 15.00 | 8.25 | 7.78 | 8.14 | 6.62 |
| C 선명 | 19.03 | 12.87 | 9.03 | 7.01 | 11.24 |
| C 정거장 | 16.18 | 9.47 | 9.69 | 9.03 | 5.55 |

- 판·성공·경고·초점·입력칸 테두리를 합쳐 모드마다 15쌍 이상을 쟀습니다. 실패는 0건입니다. 전체 목록은 `contrast.txt`와 `contrast.json`에 있습니다.
- 처음 잴 때 실패가 2종류 있어서 고쳤습니다. 선명 모드의 성공색(6.89)은 `#084ca8`로, C 파스텔의 위험색(4.43)은 `#b0204d`로 바꿨습니다.

### 글꼴 (2026-10-28 확인)
| 글꼴 | 버전 | 라이선스 | 근거 |
|---|---|---|---|
| Pretendard | 1.3.9 | OFL-1.1, 예약 이름 "Pretendard" | Verified: npm 꾸러미의 LICENSE.txt, 글꼴 이름표(1.309). 최신은 1.3.9(npm, GitHub 릴리스 검색) |
| SUIT | 2.0.5 (글꼴 2.040) | OFL-1.1, 예약 이름 "SUIT" | Verified: npm `@sun-typeface/suit` LICENSE |
| Jua | 1.001 | OFL-1.1, 예약 이름 없음 | Verified: google/fonts의 OFL.txt. 한글이 2,367자뿐이다(cmap). 드문 글자는 기기 글꼴로 나온다 |
| 나눔스퀘어라운드 | 1.000 (2017) | OFL-1.1 **추정(Assumed)** | 근거는 npm `@kfonts/nanum-square-round`, FreeBSD 포트, 산돌구름 목록뿐이다. 글꼴 파일 안에는 "All rights reserved"만 있고 OFL 문구가 없다. 네이버 공식 안내 페이지는 이 세션 네트워크에서 열리지 않았다. 예약 이름 여부는 모름(Unknown) |
| Noto Sans KR(비교용) | Fontsource 5.3.1 | OFL-1.1 | Verified: npm. 가변 글꼴 부분 집합은 304KB |

- **용량**: fontTools 4.60.1로 KS X 1001 2,350자 + 영문·문장부호 + 자모를 남겨 woff2로 쟀습니다(Verified). Pretendard가 직접 배포하는 부분 집합은 굵기마다 약 262~273KB입니다. 메시지 문구 글자만 남기면 글꼴마다 17~39KB입니다.
- **예약 이름**: 예약 이름이 있는 글꼴(Pretendard, SUIT)을 직접 줄이면 이름을 바꿔야 한다고 봅니다. OFL FAQ 미러와 웹폰트 안내를 검색 결과로 확인했고, 원문 사이트는 차단되어 열지 못했습니다(Assumed). 제작자가 배포한 부분 집합을 그대로 쓰면 이 문제가 없습니다.
- **CDN**: 쓰지 않습니다. 직접 배포해야 합니다. 글꼴 파일을 git에 넣으면 PLAN 9.8의 예외가 됩니다. 정확히 고정한 npm 꾸러미에서 빌드 때 복사하면 git에 바이너리가 없습니다. 단, Jua 원본 TTF는 npm에 없습니다(Fontsource는 조각 파일만 있음).
- **지도 라벨 주의**(Verified: troika-three-text 0.52.5 코드)
  - 넘겨준 글꼴에 없는 글자는 jsDelivr CDN(`unicode-font-resolver`)에서 받아 옵니다. 직접 지정한 주소가 실패해도 기본 CDN으로 다시 시도합니다.
  - WOFF2는 읽지 못합니다(TTF·OTF·WOFF만). 지도 라벨용으로는 같은 글꼴을 WOFF나 TTF로 따로 만들고, 모든 글자를 덮어야 합니다.
- **시안 글꼴**: 시안은 실제 글꼴 파일로 그렸습니다. npm과 google/fonts에서 scratchpad로 받았고, 글꼴이 모두 불러와졌는지 확인했습니다. 대체 글꼴은 쓰지 않았습니다.

### 세 번째 모드 후보
| | 선명(고대비 + 색각 배려) | 정거장(홀로그램) |
|---|---|---|
| 내용 | 본문 7:1 이상, 테두리 2px, 초점 4px, 그림자 없음. 성공은 파랑, 위험은 주황빨강. 상태는 늘 아이콘·글자와 함께 보인다 | 짙은 청록 바탕, 격자 무늬, 청록 빛 테두리. 판은 불투명하고 흐림 효과(blur)는 쓰지 않는다 |
| 좋은 점 | 실제 접근성 이득이 있다. 한낮 야외에서도 잘 보인다. 토큰만 바꾸면 돼서 싸다 | 궤도 정거장 설정(D-052·D-070)과 이어진다. 팬이 좋아할 만하다 |
| 나쁜 점 | 예쁨은 덜하다 | D-063(밝은 톤 기본, 차가운 하이테크 기각)과 부딪힌다. 모든 화면을 검사할 모양이 하나 더 는다. 빛 효과를 키우면 휴대폰 GPU 부담이 커진다 |

- 저녁용 따뜻한 저조도 모드도 생각해 봤지만 다크와 겹쳐서 뺐습니다.
- 추천은 "선명"입니다. "정거장"은 나중에 꾸미기 테마나 이벤트 테마로 두는 편이 낫습니다.

### 추천: A + 선명
**이유**
- 기획 톤(D-063, D-064)에 가장 가깝습니다.
- 파비콘(파란 행성, 초록 땅, 금색 고리)과 색이 같습니다.
- 버튼 턱이 "게임 화면"이라는 느낌을 줍니다.

**보완할 점**
- 촘촘한 화면용으로 `data-density="compact"` 토큰을 더합니다(턱 0, 모서리 10px, 조작부 44px).
- 주 버튼 초록과 성공 초록이 비슷합니다. 성공은 늘 아이콘과 함께 보입니다.
- UI 의미 색과 게임 콘텐츠 색(계열·12속성·이로치, D-070·D-071)은 따로 관리합니다.

**글꼴 배포 제안**
- 앱 껍데기 330KB에서 약 370KB로 늘어납니다.
- Jua: 메시지 파일(ko·en)의 글자만 남긴 약 39KB를 빌드 때 만들어 미리 캐시합니다. 예약 이름이 없어서 직접 줄여도 됩니다.
- Pretendard: 공식 KS X 1001 부분 집합 Regular·Bold(267·271KB)는 런타임 캐시에 둡니다. 처음 쓸 때 받고 저장합니다. 처음 켤 때와 오프라인 첫 실행에는 기기 글꼴로 보입니다.
- 전부 미리 캐시하면 +560~720KB입니다.

**manifest (기본 파스텔)**
- `theme_color: "#dff2fb"`, `background_color: "#dff2fb"`. 지금 값은 `#0b1020`입니다.

**`<meta name="theme-color">`**
- 항상 현재 모드의 `--bg`와 같게 합니다. 모드별 값은 파스텔 `#dff2fb`, 다크 `#13203a`, 선명 `#ffffff`, 정거장 `#061a22`입니다.
- 그라데이션 맨 위 색도 `--bg`와 같게 맞춰 두었습니다.
- 모드를 바꿀 때 `data-theme`을 바꾸고 `getComputedStyle(html).getPropertyValue("--bg")`를 meta에 넣습니다. `color-scheme`은 토큰(`--scheme`)이 따라 바꿉니다.
- "기기 설정에 맞추기"를 켜면 `matchMedia("(prefers-color-scheme: dark)")` 변화를 듣습니다.
- 첫 화면이 잘못된 색으로 번쩍이지 않게, CSS보다 먼저 작은 외부 스크립트로 모드를 정합니다. 나중에 넣을 CSP 때문에 인라인 스크립트는 피합니다.
- iOS 홈 화면 앱의 상태 표시줄 스타일은 켤 때 고정되는 것으로 봅니다(Assumed). Android 설치 앱이 meta를 실시간으로 반영하는지도 추정입니다.

### 비용과 위험 (공통)
- **새 의존성**: 없습니다. CSS 변수만 쓰고 Tailwind나 부품 라이브러리는 쓰지 않습니다. 기기로 가는 글꼴(꾸러미 또는 파일)은 디자인 시스템 ADR에 함께 적습니다. 부분 집합 만드는 도구는 개발 도구라 ADR이 필요 없습니다.
- **작업량**(Assumed): 토큰과 부품 1~2일, 모드 전환과 meta 0.5일, 글꼴 파이프라인 0.5~1일, 대비 검사를 `pnpm check`에 넣기 0.5일(`src/contrast.mjs`를 재사용).
- **다크 모드와 그림**: UI 테마는 세계 조명을 바꾸지 않습니다(D-070 ①). 그래서 다크 모드 HUD도 밝은 낮 지도 위에서 읽혀야 합니다. 시안은 그 상황 그대로 불투명 판으로 그렸습니다. 어두운 바탕을 전제로 그린 아이콘·초상은 다크 모드에서 받침판이 필요할 수 있습니다.
- **파스텔 대비**: 밝은 파스텔 위에는 흰 글자가 안 됩니다. A는 짙은 글자를 썼고 C는 보라를 진하게 했습니다.
- **기타**
  - 한국어는 `word-break: keep-all` + `overflow-wrap: anywhere`를 씁니다.
  - 입력칸 글자는 16px 이상이어야 iOS가 화면을 확대하지 않습니다.
  - 지도(WebGL) 위에서 `backdrop-filter`는 쓰지 않습니다.
  - Jua와 KS X 1001 부분 집합 밖의 글자(예: 아이디의 드문 음절)는 기기 글꼴로 섞여 나옵니다.

### 스킬 사용 기록
- 스킬은 AGENTS §8 순서대로 썼습니다: frontend-design → ui-ux-pro-max → web-design-guidelines → korean-writing.
- ui-ux-pro-max
  - Claymorphism 스타일을 추천했고, 이것이 후보 A의 바탕이 됐습니다.
  - 추천한 Google Fonts CDN은 쓰지 않았습니다.
  - "테마 전환 설정" UX는 검색이 0건이었습니다. 그 부분은 일반 지침으로 대신했습니다.
- 훅 설치나 설정 파일 변경은 하지 않았습니다.

### 파일 (모두 scratchpad)
**모아보기**
- `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/design-candidates/overview.png` (3후보 한눈에)
- `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/design-candidates/A-sprout/contact-sheet.png`
- `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/design-candidates/B-station/contact-sheet.png`
- `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/design-candidates/C-cloud/contact-sheet.png`
- `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/design-candidates/english-check.png` (영어 문구 길이 확인)

**토큰 CSS**
- `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/design-candidates/A-sprout/tokens.css`
- `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/design-candidates/B-station/tokens.css`
- `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/design-candidates/C-cloud/tokens.css`
- 공용 부품: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/design-candidates/src/components.css`

**낱장 PNG(390×844, 2배)**
- 각 후보의 `png` 폴더에 있습니다. 이름은 `<모드>-<화면>.png`입니다.
  - 모드: pastel, dark, contrast, station
  - 화면: a-login, b-newid, c-hud, d-admin, e-settings
  - 영어 화면: en-pastel-*
- 예
  - `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/design-candidates/A-sprout/png/pastel-a-login.png`
  - `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/design-candidates/A-sprout/png/pastel-c-hud.png`
  - `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/design-candidates/B-station/png/pastel-a-login.png`
  - `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/design-candidates/C-cloud/png/pastel-a-login.png`

**대비 결과**
- `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/design-candidates/contrast.txt`

**다시 그리기**
- `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/design-candidates/src/build.mjs` (Node 24, 미리 설치된 Playwright 사용)

### 사용자에게 물을 것
1. A·B·C 중 무엇을 고를까요? 섞어도 됩니다. 예: A의 버튼 + C의 글꼴.
2. 세 번째 모드는 "선명"만 둘까요, "정거장"도 나중에 꾸미기 테마로 둘까요?
3. 처음 켤 때 기본은 무엇으로 할까요? (가) 늘 파스텔 (나) 기기 다크 설정 따르기. 기기가 고대비를 요청할 때(`prefers-contrast: more`) 선명을 자동으로 고를까요?
4. 고른 테마를 어디에 저장할까요? 기기에만 두면 iOS가 7일 동안 안 쓴 사이트의 저장소를 지웁니다. 계정 설정(서버)에도 둘까요?
5. 글꼴 용량을 어떻게 할까요? (가) 미리 캐시 +약 40KB, 나머지는 쓸 때 받기(추천) (나) 전부 미리 캐시 +560~720KB.
6. C를 고르면 나눔스퀘어라운드 라이선스를 네이버 공식 안내에서 사람이 직접 확인해야 합니다. 이 세션에서는 그 페이지가 열리지 않았습니다.
7. 시안의 자원 이름(크레딧·에너지·자재)과 수치는 임시값입니다. 기획 세션에서 정해야 합니다.

Sources (조회일 2026-10-28):
- [Pretendard releases](https://github.com/orioncactus/pretendard/releases)
- [Homebrew font-pretendard](https://formulae.brew.sh/cask/font-pretendard)
- [SUIT README (jsDelivr)](https://cdn.jsdelivr.net/npm/@sun-typeface/suit@2.0.5/README.md)
- [Homebrew font-suit](https://formulae.brew.sh/cask/font-suit)
- [FreeBSD nanum-square-round](https://www.freshports.org/korean/nanum-square-round/)
- [Sandoll Cloud NanumSquareRound](https://www.sandollcloud.com/free-font/278/NanumSquareRoundOTF)
- [Nanum COPYING (CTAN)](https://ctan.uib.no/fonts/nanumtype1/doc/COPYING)
- [OFL webfonts and RFN](https://openfontlicense.org/webfonts-and-reserved-font-names/)
- [LWN on OFL subsetting](https://lwn.net/Articles/552178/)
- [troika unicode-range issue](https://github.com/protectwise/troika/issues/65)
- [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)

## 부록: 후보 A 토큰 원본 (`A-sprout/tokens.css`)
구현은 이 값을 지금 코드의 토큰 이름 규칙(`apps/game/src/styles/tokens.css`)으로 옮긴다(ADR).

```css
/* 후보 A — 새싹 장난감: 장난감 상자에서 꺼낸 들판. 말랑한 버튼(아래 턱), 굵고 둥근 제목(Jua)
   모드: pastel(기본) · dark · contrast(선명: 고대비·색각 배려) · station(정거장 홀로그램)
   이 파일은 토큰만 둔다. 부품은 토큰만 읽는다 */

/* 모드와 상관없는 값: 글꼴, 크기, 간격, 모서리, 움직임 */
:root {
  /* 글꼴 — 한글 지원. 제목은 Jua(OFL), 본문은 Pretendard(OFL). 없으면 기기 글꼴 */
  --font-display: "Jua", "Pretendard", -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif;
  --font-body: "Pretendard", -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif;
  --font-num: var(--font-body); /* Jua는 숫자 폭이 제각각이라 숫자는 본문 글꼴 + tabular-nums */

  /* 크기 단계 — 16px 기준, 약 1.2배씩 */
  --text-xs: 12px;
  --text-sm: 14px;
  --text-md: 16px;
  --text-lg: 19px;
  --text-xl: 23px;
  --text-2xl: 28px;
  --text-3xl: 34px;

  /* 굵기 */
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;
  --weight-display: 400; /* Jua는 굵기 하나 */

  /* 줄 간격 — 한글 본문은 넉넉히 */
  --lh-tight: 1.2;
  --lh-snug: 1.35;
  --lh-body: 1.55;
  --tracking-display: 0;
  --tracking-body: -0.005em;

  /* 간격 — 4px 단위 */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  /* 모서리 — 위계별로 다르게: 판 > 조작부 > 작은 칩 */
  --radius-sm: 10px;
  --radius-control: 16px;
  --radius-panel: 26px;
  --radius-pill: 999px;

  /* 조작부 크기 */
  --control-h: 52px;
  --control-h-sm: 44px;
  --border-w: 2px;
  --field-border-w: 2px;
  --focus-w: 3px;
  --lip: 4px; /* 버튼 아래 턱 두께. 누르면 0 */

  /* 움직임 — 누름 반응은 짧게, 튀는 곡선은 손을 뗄 때만 */
  --dur-fast: 120ms;
  --dur-base: 200ms;
  --dur-slow: 320ms;
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* 파스텔(기본) — 하늘에서 풀밭으로. 버튼은 밝은 잎색 + 짙은 글자 */
:root[data-theme="pastel"],
[data-theme-preview="pastel"] {
  --scheme: light;
  --bg: #dff2fb;
  --bg-image: linear-gradient(180deg, #dff2fb 0%, #e6f6f1 58%, #dcf1d2 100%); /* 맨 위 색 = --bg = theme-color */
  --surface: #ffffff;
  --surface-2: #eef8e8;
  --text: #22324a;
  --text-muted: #4d5d74;
  --accent: #8ed97f;
  --accent-text: #14361b;
  --accent-lip: #58a64a;
  --accent-2: #ffd66e;
  --secondary-lip: #c3dcb8;
  --success: #226b33;
  --warning: #7a4d00;
  --danger: #b8283f;
  --focus: #1f63d6;
  --border: #cfe3ee;
  --field-bg: #f7fbff;
  --field-border: #6f8aa0;
  --overlay: rgb(34 50 74 / 45%);
  --shadow-1: 0 2px 0 rgb(34 50 74 / 6%), 0 4px 10px rgb(34 50 74 / 8%);
  --shadow-2: inset 0 2px 0 rgb(255 255 255 / 80%), 0 10px 28px rgb(42 92 120 / 14%);
  --heading-shadow: none;
  --deco-1: #bfe3b0;
  --deco-2: #9fd68c;
  --deco-3: #6fbf63;
  --deco-sun: #ffd66e; /* 파스텔: 해, 다크: 달 */
}

/* 다크 — 밤의 들판. 잎색 버튼은 그대로 두어 톤을 잇는다 */
:root[data-theme="dark"],
[data-theme-preview="dark"] {
  --scheme: dark;
  --bg: #13203a;
  --bg-image: linear-gradient(180deg, #13203a 0%, #15243d 62%, #17301f 100%);
  --surface: #1c2b47;
  --surface-2: #233756;
  --text: #eef5ff;
  --text-muted: #a9bad3;
  --accent: #8ed97f;
  --accent-text: #14361b;
  --accent-lip: #4a8d3e;
  --accent-2: #ffd66e;
  --secondary-lip: #142238;
  --success: #86e08f;
  --warning: #f5c56b;
  --danger: #ff8b9b;
  --focus: #8cc8ff;
  --border: #33496b;
  --field-bg: #15223b;
  --field-border: #7d93b5;
  --overlay: rgb(5 10 20 / 60%);
  --shadow-1: 0 2px 0 rgb(0 0 0 / 20%), 0 6px 14px rgb(0 0 0 / 25%);
  --shadow-2: inset 0 1px 0 rgb(255 255 255 / 6%), 0 12px 30px rgb(0 0 0 / 35%);
  --heading-shadow: none;
  --deco-1: #1d3a2b;
  --deco-2: #22472f;
  --deco-3: #2d5a3a;
  --deco-sun: #e9e2c0; /* 파스텔: 해, 다크: 달 */
}

/* 선명 — 고대비(본문 7:1 이상) + 색각 배려(성공=파랑, 위험=주황빨강, 상태는 늘 아이콘·글자와 함께) */
:root[data-theme="contrast"],
[data-theme-preview="contrast"] {
  --scheme: light;
  --bg: #ffffff;
  --bg-image: none;
  --surface: #ffffff;
  --surface-2: #eef2f7;
  --text: #0a1424;
  --text-muted: #2e3b50;
  --accent: #0b4fb3;
  --accent-text: #ffffff;
  --accent-lip: #062f6e;
  --accent-2: #ffd66e;
  --secondary-lip: #0a1424;
  --success: #084ca8;
  --warning: #7a3f00;
  --danger: #a82a00;
  --focus: #0a1424;
  --border: #0a1424;
  --field-bg: #ffffff;
  --field-border: #0a1424;
  --overlay: rgb(0 0 0 / 70%);
  --shadow-1: none;
  --shadow-2: none;
  --heading-shadow: none;
  --deco-1: #e3e8ef;
  --deco-2: #cfd7e2;
  --deco-3: #b7c2d1;
  --deco-sun: #dfe5ec; /* 파스텔: 해, 다크: 달 */
  --border-w: 2px;
  --field-border-w: 2px;
  --focus-w: 4px;
  --weight-regular: 500;
}

/* 정거장 — 궤도 정거장 안 화면(홀로그램). 청록 빛 테두리, 불투명 판(흐림 효과 없음) */
:root[data-theme="station"],
[data-theme-preview="station"] {
  --scheme: dark;
  --bg: #061a22;
  --bg-image:
    repeating-linear-gradient(0deg, rgb(95 227 230 / 5%) 0 1px, transparent 1px 28px),
    repeating-linear-gradient(90deg, rgb(95 227 230 / 5%) 0 1px, transparent 1px 28px),
    radial-gradient(circle at 50% 115%, #0f4a55 0%, #061a22 62%);
  --surface: #0c2a34;
  --surface-2: #113844;
  --text: #e4fbff;
  --text-muted: #94c6d2;
  --accent: #5fe3e6;
  --accent-text: #03282d;
  --accent-lip: #2a9ea4;
  --accent-2: #ffd66e;
  --secondary-lip: #071f27;
  --success: #7cf0b4;
  --warning: #ffd479;
  --danger: #ff9080;
  --focus: #ffffff;
  --border: #2b7584;
  --field-bg: #08222b;
  --field-border: #4fb7c6;
  --overlay: rgb(0 10 14 / 65%);
  --shadow-1: 0 0 0 1px rgb(95 227 230 / 25%);
  --shadow-2: 0 0 0 1px rgb(95 227 230 / 35%), 0 0 22px rgb(95 227 230 / 18%);
  --heading-shadow: 0 0 14px rgb(95 227 230 / 45%);
  --deco-1: #0d3a44;
  --deco-2: #12505c;
  --deco-3: #1d7380;
  --deco-sun: #1d7380; /* 파스텔: 해, 다크: 달 */
}

/* 움직임 줄이기 — 기기 설정과 게임 설정 둘 다 */
@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-fast: 0ms;
    --dur-base: 0ms;
    --dur-slow: 0ms;
  }
}
:root[data-motion="reduce"] {
  --dur-fast: 0ms;
  --dur-base: 0ms;
  --dur-slow: 0ms;
}
```
