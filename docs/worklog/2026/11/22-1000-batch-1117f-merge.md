# 2026-11-22 묶음 1117f 합치기 (수호신 = 휴먼의 상태, 유닛 종류 넷 고정) + 미러 76fd3b6 — 리셋 필요 없음

- 일시: 2026-11-22 10:00~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `22-0940-guardian-kind`, 질문 `docs/questions/2026-11-22-guardian-kind.md`(2631·2632), ADR `2026-11-07-temple-religion.md` "바뀜 (guardian-kind)",
  기획 D-589(사용자 결정 2026-11-22 "4종류는 고정이라고 했다 왜 마음대로 늘리냐")·D-590

## 한 일
- main 14537f2649(묶음 1117e 기록) 위에 줄기 하나를 합쳤다(합치기 커밋 `--no-ff`).
  1. `work/guardian-kind`(46e2b5a298, 바탕 14537f2649): 팩 unit_kinds의 다섯째 종류 `guardian`을 지우고(지운 기록 = `id-changes.json` 뒤에 더함, 보상 = `human`),
     수호신을 휴먼(세계 종류 코드 4)의 상태 `world_units.guardian`으로 바꿨다. 마이그레이션 `20261122002529_guardian_state`(칸 더하기 + 옛 `kind 6 → 4, guardian true`),
     부팅 때 같은 바꾸기(`world/persist/load.ts`), 판정 `isGuardianUnit`. 프로토콜·SIM 그대로.
- 충돌 없음(바탕이 main 그대로).
- 기획 미러를 AntiGravt01 `claude/sweet-wright-4ubb2u` **76fd3b6**로 동기화했다(앞 미러 eb8960a → cba9f26 D-588 보충, 270e3a4 D-589, 76fd3b6 D-590. 바뀐 파일
  `00_README.md`·`02_Decision_Log.md`·`03_Planning_Rules.md`, 지운 파일 없음, 결정 로그 D-001~D-590·Step 5 D-5068·Step 6 D-6049·Step 7 D-7054).
  `49_Settings.md`는 바뀌지 않아 `pnpm settings:cells`는 돌리지 않았다(`--check` 최신). `pnpm check:wiki --stale`: 알림 26줄(모두 옛 결정의 "대체" 표시, D-589·D-590은
  없음 — 보고만, 위키는 고치지 않음). D-589 원문은 ADR "바뀜 (guardian-kind)"의 사용자 원문 인용과 같다(Verified: 미러 `02_Decision_Log.md` D-589).
- 묶음 1117e 기록(`22-0825-batch-1117e-merge.md`) 끝에 "배포 (Verified)" 절을 붙였다(코디네이터 배포 메모 그대로).

## 판 번호 다시 매김
| 무엇 | main | 줄기 판 | 묶음 판 |
|---|---|---|---|
| 프로토콜 | 65(최소 64) | 그대로 | **65(최소 64)** 그대로 |
| 팩 core | 143 | guardian-kind 183 | **144** |
| SIM_VERSION | 74 | 그대로 | **74** 그대로 |

- 팩: `manifest.json` 144, `id-changes.json`의 새 기록(unit_kinds `guardian`) `since` 183 → 144(뒤에 더한 그 기록만 — 앞 기록은 안 건드림).
- ADR `2026-11-07-temple-religion.md` "바뀜 (guardian-kind)" 결정 줄: `core@144(묶음 1117f — 줄기 판 183)`. 줄기 작업 기록·질문 파일은 줄기 판 그대로 두었다.

## 마이그레이션
- 새 마이그레이션은 guardian-kind의 하나뿐: `20261122002529_guardian_state`(스냅숏 `2110cf87-ab35-4e1e-9369-214a912806a9`, prevIds = 1117e 끝 `7e79264e-c94f-43c1-b1a3-9e2f1ba61755`) —
  `world_units.guardian` boolean 기본 false + `UPDATE world_units SET kind = 4, guardian = true WHERE kind = 6`. 고치지 않고 그대로 합쳤다.
- `pnpm --filter @terra/server db:generate` = "No schema changes"(Verified).
- 다음 마이그레이션 `prevIds` = **2110cf87-ab35-4e1e-9369-214a912806a9**.

## 질문 번호
- 2631·2632(2633~2635 비워 둠) — main(2614까지)과 겹치지 않아 옮기지 않았다.

## 리셋 필요 여부: 필요 없음
- 마이그레이션이 옛 수호신 줄(종류 6)을 휴먼 + 수호신 상태로 바꾼다. 마이그레이션과 앱 교체 사이에 직전 판 앱이 다시 쓴 6은 새 앱 부팅이 같은 문장으로 바꾼다.
- **되돌림 주의**: 마이그레이션 뒤 직전 판 앱(1117e)을 다시 배포하면 그 앱은 바뀐 수호신을 휴먼 행 없는 휴먼으로 본다 — 수호신 규칙(머묾·방어 참전·웨이브 전투 열기)을 잃는다.
  앱은 돈다. 새 판으로 다시 올리면 돌아온다(줄기 기록, 미실행 — 코드 읽기로 추정).
- 프로토콜 그대로라 기기는 그대로 들어온다. 팩 core@144에서 `guardian` 종류가 빠졌다(편집기 종류 고르기는 넷).

## 바꾼 파일과 이유 (합치며 바꾼 것)
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json`, `content/core/id-changes.json`(새 기록의 `since`만) | 팩 core@144 |
| ADR `2026-11-07-temple-religion.md` | 판 줄 |
| `docs/design/`(README 빼고), `docs/design/README.md` | 미러 76fd3b6, 원본 커밋·동기화 시각 |
| `docs/worklog/2026/11/22-0825-batch-1117e-merge.md` | 1117e 배포 확인(Verified) 절 |
| `docs/worklog/2026/11/22-1000-batch-1117f-merge.md`, `docs/WORKLOG.md` | 이 기록·목차 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 66(최소 65), 팩 145, SIM 75. 다음 마이그레이션 `prevIds` = `2110cf87-ab35-4e1e-9369-214a912806a9`.
- **TODO(다음 배포 — 이 판이 운영에 올라가 확인된 뒤)**: `apps/server/src/world/persist/load.ts`의 부팅 때 종류 6 → 4 바꾸기 UPDATE 문장과 `LEGACY_UNIT_KIND_GUARDIAN` 읽기를 지운다(정리 단계).
- 수호신 판정은 `isGuardianUnit(info)`(`world/unitKinds.ts`) 하나로 한다. 휴먼 규칙을 새로 더하는 코드는 수호신을 빼야 하는지 본다(줄기 기록 표).

## 건드리지 말 것
- 마이그레이션 `20261122002529_guardian_state`(이제 올라간다 — 고치지 않는다). 세계 종류 코드 6은 다시 쓰지 않는다.
- 전투 직업 `guardian`(가디언, `combat_classes.json`)은 유닛 종류와 다른 것이다.
- `id-changes.json`은 뒤에 더하기만 한다.

## 검사 (Verified)
- 합치고 판 손질·미러를 한 뒤 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 첫 판 **통과**: 포맷(3,370파일)·린트·타입·모듈 경계·파일 크기·다국어(8,907키)·
  디자인 값(746쌍)·콘텐츠(core@144 f8c6fd7b43eb), 시험 파일 **889/889**, 시험 **6,352/6,352**(`guardianState.db.test.ts` 포함, `@terra/sim` 골든 그대로).
- `pnpm check:content`(호환 포함, core@144 f8c6fd7b43eb, 단계 1·2·4a·4b 기준 14537f2), `pnpm check:docs`, `pnpm docs:index --check`, `pnpm wiki:index --check`(항목 40개),
  `pnpm settings:cells --check`, `db:generate` "No schema changes" 통과.
- `pnpm build` 통과(PWA 257항목), `pnpm check:bundle` 첫 화면 JS **110,757 B** / 상한 131,416 B(1117e 110,771 B에서 −14 B, 파일 7개).
- 화면 시험(빌드한 앱, 한 번에 세 파일, 3.4분): `temple.spec.ts` **5/5**, `battleLab.spec.ts` **18/18**(유닛 종류 고르기 넷 확인 포함), `units.spec.ts` **15/15** — 합 **38/38**.
  흔들림·다시 돌림 없음. `unit-control.spec.ts`는 줄기에서 돌았고(줄기 합 59/59) 묶음에서 다시 돌리지 않았다. 결과 폴더는 지웠다.

## 미검증·알려진 문제
- 운영 DB의 마이그레이션(옛 종류 6 줄 바꾸기)은 배포 때 확인. 운영에 수호신 유닛이 몇 있는지는 재지 않았다(Unknown).
- 되돌림 때의 동작(위)은 미실행.
- [임시] 질문 2631(남에게는 휴먼으로 보임)·2632(유닛 화면 휴먼 거르기에 듦).

## 사용자 결정 대기
- 질문 2631·2632(guardian-kind, 추천 = 지금 코드), 그리고 1117e 기록의 대기 목록(2601~2604, 2611~2614 …).
