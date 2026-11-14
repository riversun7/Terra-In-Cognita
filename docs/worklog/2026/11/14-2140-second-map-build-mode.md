# 2차맵 건축 모드(1단계)와 지을 수 있는 땅 규칙

- 일시: 2026-11-14 21:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-14-second-map-build.md`(새로 씀), 기획 D-483, `docs/adr/2026-11-07-buildings-runtime.md`

## 한 일

사용자 요청(2026-11-14): "다음작업은 2차맵에서 건설하는 기능 구현이다. 도시 버튼을 통해 2차맵에 건축모드로 진입한다."
사용자 답(물음 세 번)은 ADR "선택지와 사용자 답"에 원문으로 적었다. 순서는 "단계로 나눠 배포"다. 이번은 1단계다.

- **건축 모드 화면**: [도시] → [건설] → 건물 목록 → 고르기 → 땅을 누르면 그 칸이 가운데인 반투명 미리보기와 격자 → [회전]·[다른 건물]·[짓기]·[닫기].
  - 기기 대략 판정: 2차맵 밖·겹침·물가·재료·다른 세력 도시. 초록·빨강과 [짓기] 켜기를 정한다.
  - 건축 모드에서 땅을 누르면 미리보기만 옮긴다. 이동·채집 판·옆 2차맵 보내기는 하지 않는다.
  - 다른 아래 판은 숨기고, 아래 탭을 누르면 건축 모드가 닫힌다.
  - 일꾼: 고른 내 유닛(이 2차맵, 쉬는 중)을 `unitIds`로 넣는다(지금 규칙 = 시간 단축).
- **엔진 미리보기 층** `createBuildPreview`: 반투명 상자·테두리·바닥판(초록/빨강), 땅 높이에 맞춘다.
- **서버 땅 규칙**: 그 2차맵에 내 세력이 아닌 도시만 있으면 `facility_build`를 `forbidden`으로 막는다. 화면용 조회 `facilities.landRule`을 더했다.
- 프로토콜 판·DB 마이그레이션은 없다.

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `apps/server/src/facilities/landRule.ts`(새, + 시험)·`service.ts`·`world.ts` | 땅 규칙, 짓기 명령에서 배치 검사 앞에 본다 |
| `apps/server/src/facilities/screen.ts`·`appSource.ts`·`apps/server/src/trpc/facilities.ts`·`packages/shared/src/facilities.ts` | `facilities.landRule` 조회와 응답 타입 |
| `apps/server/src/testDb.ts`·`facilities.db.test.ts`·`attack.db.test.ts`·`gather/station.db.test.ts`·`labor/produce.db.test.ts`·`travel/travel.db.test.ts` | `joinCityFaction` 도우미(시험 세계 2차맵에 NPC 도시가 있어 그 세력에 가입), 땅 규칙 DB 시험 |
| `packages/engine/src/buildings/buildPreview.ts`(새, + 시험)·`index.ts` | 반투명 미리보기 층 |
| `apps/game/src/map/construction/`(새: `BuildSheet.tsx`·`buildMode.ts`·`buildModel.ts`(+ 시험 둘)·`build.css`) | 건축 모드 상태·판정·판 |
| `apps/game/src/map/SecondaryMapScreen.tsx`·`useMapEngine.ts`·`city/CitySheet.tsx` | 건축 모드 연결, 땅 누르기 가로채기, [건설] 단추 |
| `apps/game/src/economy/queries.ts` | `useLandRule` 조회 |
| `apps/game/messages/{ko,en}.json` | 화면 문구(ko·en 함께) |
| `e2e/build-mode.spec.ts`(새) | 건축 모드 화면 시험·사진 |
| `docs/adr/2026-11-14-second-map-build.md`(새) | 결정 기록 |

## 함께 바꿔야 하는 파일

- 땅 규칙을 바꾸면 서버 `landRule.ts`와 기기 판정 `construction/buildModel.ts`(`foreign_city`)를 같이 본다. 기기는 서버 조회 답만 쓴다.
- 서버 짓기 시험을 새로 쓰면 NPC 도시가 있는 2차맵에서는 `joinCityFaction`을 부른다(안 부르면 `forbidden`).
- `secondMapEngine.ts`는 998줄이다. 엔진 기능은 층 모듈(`engine.addLayer`)로 더한다.

## 건드리지 말 것

- 폴더 이름 `build/`를 쓰지 않는다. 루트 `.gitignore`의 `build/`가 그 폴더를 무시한다(처음에 `map/build/`로 만들었다가 `map/construction/`으로 바꿨다).

## 미검증·TODO·알려진 문제

- 1단계 일꾼은 옛 규칙(건설 시간 단축)이다. 납품·작업량·피로도는 2단계다(ADR).
- 알박기(정부 건물을 다 지으면 도시가 됨)와 동맹 건설 정책은 3단계다. 지금 동맹 도시 2차맵은 늘 막힌다(사용자 답 "기본 금지"와 같다).
- 기기 판정은 막힌 지형·유닛 자리를 보지 않는다. 서버가 [짓기] 때 거절하면 판에 오류 문구가 뜬다.
- 폐허가 된 도시가 `world_cities`에서 빠지는지 보지 않았다(Assumed).
- 휴대폰에서 보지 않았다(미검증). 헤드리스 화면 시험만 했다.
- `SecondaryMapScreen.tsx`가 약 810줄이다(600줄 경고). 다음 기능 전에 나눈다.

## 사용자 결정 대기

- 2단계 숫자(작업량·피로도 비율)는 기획에서 정해야 한다.

## 검사
- 단위 시험(Verified):
  - 서버 전체(DB 포함, `TEST_DATABASE_URL`) 236개 파일·1,497개 통과. 땅 규칙 순수 시험 4개, DB 시험 "2차맵 건설 땅 규칙" 포함.
  - 게임·엔진·shared 273개 파일·2,277개 통과(건축 모드 상태·배치 판정·미리보기 상자 시험 포함).
  - 타입 검사(게임)·oxlint·`check:contrast` 통과.
- 화면 시험(Playwright, 헤드리스, Verified): `build-mode.spec.ts` 4개, `map-hud.spec.ts` 8개 모두 통과.
  - [도시] → [건설] → 고르기 → 땅 누르기 → [회전] → [다른 건물] → [닫기], 아래 탭으로 닫힘.
  - 땅 규칙 막힘(응답을 바꿔 봄): 경고·[짓기] 꺼짐.
  - 처음에 땅 규칙 시험이 실패했다. 판의 `data-problem`이 첫 문제만 보여 `foreign_city`가 `no_cell`보다 앞에 왔기 때문이다. `data-problem`을 문제 전체(빈칸으로 이음)로 바꿨다.
- 사진(390, 파스텔·다크, 눈으로 봄): 목록·놓기. 겹치는 자리에 빨간 반투명 상자가 보인다.
  - 사진을 보고 고친 것: 목록 단추 글자가 가운데였다(기본 단추의 `justify-content: center`) → 왼쪽. 건축 모드에서 "땅을 누르면 그곳으로 보냅니다" 안내 줄과 지도자 판을 숨겼다.
  - 다크 테마의 꺼진 [짓기] 단추는 진한 초록이라 켜진 것과 헷갈릴 수 있다(공용 `button-primary` 꺼짐 모양, 이번에 고치지 않음).
- 합치기 전 검사(Verified): `pnpm check` 통과(단위 시험 4,890개 통과·341개 건너뜀 — DB 시험은 `TEST_DATABASE_URL` 없이 건너뜀, 위 DB 실행은 따로 통과). 처음엔 서버 타입 검사가 시험 파일의 `viewer` 타입(roles가 `string[]`)으로 실패해 `Viewer` 타입을 붙였다. `pnpm build`·`check-pwa`(화면 주소 62개) 통과. `check:bundle` 첫 화면 JS 109,694B / 상한 131,416B(앞 묶음 109,712B와 거의 같다 — 건축 모드는 지연 조각인 2차맵 화면에 든다).
