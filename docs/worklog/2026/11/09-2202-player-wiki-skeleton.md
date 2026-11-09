# 플레이어 위키 틀: docs/wiki/ + 색인 생성기 + 검사, 보기 항목 5개

- 일시: 2026-11-09 22:02 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-09-player-wiki.md`, `docs/wiki/README.md`, 기획서 미러 규칙 `docs/design/README.md`

## 한 일
- 기획서를 쉬운 말로 푸는 **플레이어 위키**의 틀(P0)을 만들었다. 사용자 결정 4개(2026-11-09)를 ADR에 적었다: 저장소 마크다운 + 게임에서 들어가는 입구, 쪼개는 단위는 재량(기획서 체계를 그대로), 기획서 전체 + 상태 표시, 한국어 먼저.
- 구조: **항목 1개 = 파일 1개**(`docs/wiki/pages/<id>.md`), 머리 칸 + 3단 깊이(`한 줄` → `쉽게 말하면` → `자세한 규칙`), 상태 두 축(`status` 기능 / `stage` 글).
- **분류를 손으로 적지 않는다.** 항목의 `source`(기획서 경로)에서 뽑는다 → 위키 분류 = 기획서 장 체계. 어긋날 수 없다.
- 색인·분류 지도·용어 대조표를 자동 생성(`pnpm wiki:index`), 검사(`pnpm check:wiki`)를 만들고 푸시 전 훅에 넣었다.
- 보기 항목 5개를 썼다: 1차맵·2차맵(지금 되는 것), 사이보그·만족도(만드는 중), 도시 주식(기획만 있는 것).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `docs/adr/2026-11-09-player-wiki.md` | 새 ADR. 자리·쪼개는 단위·상태 두 축·검사·앵커 금지 결정과 이유 |
| `docs/wiki/README.md` | 위키 쓰는 규칙(머리 칸 규격, 3단 깊이, 링크 규칙, 쓰는 차례) |
| `docs/wiki/start.md` | 처음 온 사람이 읽을 길잡이(뼈대) |
| `docs/wiki/pages/{primary-map,second-map,cyborg,satisfaction,city-stock}.md` | 보기 항목 5개. 글 말투와 상태 표시의 기준 |
| `docs/wiki/{index,categories,terms}.md` | 자동 생성(색인·분류 지도·진행 표·용어 대조표) |
| `scripts/wiki-lib.mjs` | 머리 칸 읽기·장 제목 뽑기 공용 함수(생성기와 검사가 함께 쓴다) |
| `scripts/build-wiki-index.mjs` | 색인 생성. `--check`는 최신인지만 본다 |
| `scripts/check-wiki.mjs` | 검사. `--stale`은 다시 볼 항목 찾기 |
| `package.json` | `wiki:index`·`check:wiki` 명령 |
| `lefthook.yml` | 푸시 전에 `check:wiki`·`wiki:index --check` |
| `AGENTS.md` | 기록 규칙 표에 위키 한 줄, 명령어 표에 두 줄, 훅 설명 |

## 함께 바꿔야 하는 파일
- 항목을 더하거나 고치면 `pnpm wiki:index`를 돌려 `index.md`·`categories.md`·`terms.md`를 함께 커밋한다(푸시 전 훅이 막는다).
- 기획서 미러를 새로 복사하면(`docs/design/README.md` 절차) `pnpm check:wiki --stale`을 돌려 다시 볼 항목을 찾고 `checked` 날짜를 새로 적는다.
- 게임에서 들어가는 입구(메뉴·설정의 "도움말")는 P1이 끝난 뒤에 단다. 그때 `packages/shared/src/navigation.ts`(항목 ID는 계정에 저장되므로 한 번 쓴 ID는 재사용 금지)와 메시지 키(ko·en 함께)가 걸린다.

## 건드리지 말 것
- `docs/design/`은 미러다. 위키를 쓰다 모순을 찾아도 여기서 고치지 않는다 → `docs/questions/`로 기획 세션에 넘긴다.
- `docs/wiki/{index,categories,terms}.md`는 자동 생성이라 직접 고치지 않는다.
- 링크에 `#앵커`를 쓰지 않는다. 깃허브가 한국어 제목에서 만드는 앵커 규칙을 확인할 수 없다(Unknown). 검사가 막는다.

## 미검증·TODO·알려진 문제
- **Verified(실행)**: `node scripts/check-wiki.mjs`(항목 5개 통과), 일부러 틀린 D-ID·없는 기획서 절·깨진 링크·`지금` 줄 불일치를 넣어 네 가지 모두 잡는 것을 확인했다. `build-wiki-index.mjs --check` 최신 확인. `pnpm lint`(Node 24.22.1), `pnpm format:check` 통과.
- **Verified(읽음)**: `.github/workflows/ci.yml` `changes` 단계가 `docs/`·`.md`만 바뀐 푸시에서 `deploy=false`로 이미지·배포를 건너뛴다 → 문서만 고칠 때 앱이 다시 빌드되지 않는다.
- 이 작업 환경의 기본 `node`는 v22.23.4다. 저장소는 Node 24를 요구하므로(`package.json` engines) 검사는 `/opt/node24/bin`을 PATH 앞에 두고 돌렸다.
- 진행: 항목 5개(초안 4 / 뼈대 1). 기획서 본문 소제목 462개 기준으로 보면 전면 작업은 약 150항목 예상(P2). 다음은 P1 = 초보자가 처음 30분에 만나는 항목 약 30개 + 길잡이 3개.
- `start.md`는 뼈대다. 길잡이 폴더(`docs/wiki/guides/`)와 `faq.md`는 아직 없다(P1에서 만든다).
- 영어 본문은 없다(사용자 결정: 한국어 먼저). 영어 이름은 머리 칸 `titleEn`과 `terms.md`에 모았다.

## 사용자 결정 대기
- P1(핵심 항목 30개)을 바로 이어서 쓸지, 아니면 지금 틀을 먼저 보고 고칠 점을 말할지.
- 게임 입구를 어디에 둘지: 사이드 메뉴 항목으로 추가할지, 설정 화면 안의 링크로 둘지(메뉴 항목 ID는 계정에 저장되어 되돌리기 어렵다).
