# 사이보그 스탯 판을 옛 프로젝트 모양으로 다시: 상세 전투 스펙·핵심 사양 출처 상세, 2차 스탯 색

- 일시: 2026-11-01 13:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-cyborg-sheet-old-look.md`(새로, 확정), `docs/adr/2026-11-01-ui-visibility.md`(상태 줄만 "일부 대체됨"), 앞 작업 기록 `docs/worklog/2026/11/01-1200-cyborg-ui.md`, 기획 D-448·D-449·D-024, 옛 프로젝트 AntiGravt01 `terra-client/src/components/character/CyborgProfile.tsx`·`StatBar.tsx`·`SecondaryStatsCard.tsx`(읽기만). 가지 `work/cyborg-ui-2`(main `5981da7`에서)

## 한 일
- 왜: 사용자가 정거장 테마의 상세 전투 스펙(HP·아머 HP·쉴드 HP 막대가 1차 스탯 여섯 색으로 나뉜 것)을 보고 반려했다(원문): "왜 이렇게 조잡하게 만들었냐? 스탯 기여도에 따라 색칠하는게 아니지 장난하냐? 차라리 원래 프로젝트를 그냥 따라해라. 2차스탯색깔도 1차스탯하고 겹치면 안되는거고. 기본 1차스탯이 장비나 스킬등에 합쳐지는것이니 마우스 오버나 모바일에서 스탯바 클릭시 세부 기여 출처를 적어주는거고."
- 상세 전투 스펙(`cyborg/CombatSpecs.tsx`·`combatSpecs.css`): 옛 SecondaryStatsCard 그대로 — 머리 띠(아이콘·제목·부제), 묶음 칸 VITALS 전투자원·OFFENSE 공격·DEFENSE 방어·MOBILITY 기동(·EFFICIENCY 효율은 행이 없어 안 그림·기타), 줄마다 ▶/▼ + 아이콘(`statIcons.tsx`, 직접 그린 선 그림) + 이름 + 한 색 막대 + 고정폭 값, 펼치면 "공식 … | 캡 … · 반감 …"·입력 줄 `STR(43)×1.5 = 64.5`·가중합 → 내림·장비·곡선·"= 결과", 아래 줄 "Lv 23 | STR:43 VIT:39 …". 1차 스탯 기여로 칠하지 않는다. 묶음 배치는 ADR 표.
- 2차 스탯 색 `--color-sec-*` 15개 × 테마 넷: 1차 스탯 색과 다른 계열(전투자원 청록, 공격 자홍, 방어 회색, 기동 연두), 대비 검사 쌍 180개 추가(테마 4개 412쌍, 최저 글자 4.75). 고정폭 글꼴 토큰 `--font-mono`(기기 글꼴).
- 핵심 사양(`cyborg/CoreStats.tsx`·`coreStats.css`): 옛 StatBar — 약자·이름 | 합친 값 막대(같은 스탯 색의 진하기로 몸 값 → 장비 → 인공장기(빗금) → 스킬·효과) | 합계. 막대를 누르면 줄 아래에 출처 상세(몸 값 또는 만렙이면 처음 값 + 레벨 성장(K), 장비 칸 아이템마다 이름 · 칸, 스킬·효과, 합계), 마우스를 올리면 떠서 보임, 하나만 열림, Escape로 닫힘. 두 칸씩 묶음·스탯 색(D-448) 그대로.
- 서버 출처: `bodySheet`가 `CyborgBody.primarySources`(스탯마다 body | initial·growth(K‰) | item(칸·아이템·값, 보석 몫 포함) | effect)를 보낸다. 더하면 base + bonus(시험). 사이보그 화면은 만렙일 때만 처음 값·레벨 성장(D-449).
- 지운 것: 앞 가지의 `CyborgSpecs.tsx`·`cyborgSpecs.css`(여섯 색 막대·핵심 사양 두 칸), 쓰지 않는 메시지 6개.
- 처음 만든 출처 상세는 떠 있는 판이라 휴대폰에서 아래 줄을 가렸다(화면 시험이 잡음) → 누르면 줄 아래에 끼워 넣고, 마우스로 올릴 때만 뜨게 했다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/roster.ts` | `RosterPrimarySource`, `CyborgBody.primarySources` |
| `apps/server/src/roster/body.ts`·`cyborgBody.ts`(+`roster.test.ts`) | 1차 출처 계산, 만렙이면 처음 값·레벨 성장 |
| `apps/game/src/cyborg/CombatSpecs.tsx`·`combatSpecs.css`·`statIcons.tsx` | 옛 상세 전투 스펙 |
| `apps/game/src/cyborg/CoreStats.tsx`·`coreStats.css` | 옛 핵심 사양 + 출처 상세 |
| `apps/game/src/cyborg/cyborgText.ts`(+시험)·`CyborgScreen.tsx` | 옛 묶음 배치·막대 채움·출처 칸, 화면 연결 |
| `apps/game/src/cyborg/CyborgSpecs.tsx`·`cyborgSpecs.css` | 지움 |
| `apps/game/src/styles/tokens.css`, `scripts/design-tokens.mjs`(+시험) | `--color-sec-*`, `--font-mono`, 대비 쌍 |
| `apps/game/messages/{ko,en}.json` | 묶음 표지·이름, 출처 줄, 범례, 부제, 캡 줄(추가 24, 지움 6, 1,876 → 1,894키) |
| `e2e/cyborg.spec.ts`·`first-login.spec.ts`·`units.spec.ts` | 새 모양 검사(출처 상세·Escape·마우스 올림·한 색 막대·2차 색 ≠ 1차 색·공식 상자), 사진 |
| `docs/adr/2026-11-01-cyborg-sheet-old-look.md`, `docs/adr/2026-11-01-ui-visibility.md`(상태 줄), `AGENTS.md` 8장 줄 | 결정 |

## 함께 바꿔야 하는 파일
- 팩에 2차 스탯 행이 생기면 `cyborg/cyborgText.ts` `COMBAT_ROWS`(묶음), `combatSpecs.css`(줄 색), `tokens.css`(`--color-sec-*` 넷 테마), `statIcons.tsx`(아이콘), `scripts/design-tokens.mjs`(대비 쌍)를 함께. 넣지 않으면 기타 묶음·기타 색·점 아이콘으로 보인다.
- 버프가 화면 자료에 들어오면 `bodySheet` 출처에 `effect`를 넣는다(화면은 이미 보인다).

## 건드리지 말 것
- 1차 스탯 색(`--color-stat-*`)과 2차 스탯 색(`--color-sec-*`)을 같은 계열로 섞지 않는다(사용자 요청).
- 상세 전투 스펙 막대를 1차 스탯 기여로 나눠 칠하지 않는다(사용자 반려).

## 미검증·TODO·알려진 문제
- 휴대폰 실기기에서는 보지 않았다(헤드리스 Chromium 390·1440 사진).
- 옛 화면의 보호막 재생·반격·이동속도·소모 감소는 우리 규칙에 행이 없어 넣지 않았다.
- NAS에 배포하지 않았다(미실행).

## 검사
- Verified: `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm check` 통과 — 시험 파일 305개·시험 2,617개(DB 시험 포함), 다국어 1,894키, 대비 테마 4개 412쌍(최저 글자 4.75), 화면 CSS 37개 직접 쓴 값 없음, 콘텐츠 core@14.
- Verified: 시험 `roster.test.ts`(출처를 더하면 base + bonus, 인공장기·장신구 출처, 만렙이면 처음 값 + 레벨 성장(K)), `cyborgText.test.ts`(옛 묶음 배치·효율 빈 묶음 빠짐·기타, 막대 채움, 출처 칸 차례), `design-tokens.test.mjs`.
- Verified: 화면 시험 전체 `pnpm e2e` 199개 중 198 통과·1 건너뜀(측정 시험, `E2E_MEASURE=1`일 때만), 16.7분. `cyborg.spec.ts` 17개(플레이어: 핵심 사양 차례·색·출처 상세·다른 막대·Escape, 2차 막대 색 = `--color-sec-*`이고 1차 색과 다름, 옛 묶음 넷, 공식 상자 8줄·"= 값", 키보드 펼침 / 만렙 K·처음 값·레벨 성장 / 데스크톱 마우스 올림 / 나쁜 자료 ko·en / 사진 10 + 정거장 2).
- Verified: 첫 화면 JS `pnpm check:bundle` 131,140B / 상한 131,416B(남음 276B). 새 코드는 `/cyborg` 지연 조각에만 있다. 상한은 올리지 않았다.
- 사진(저장소 밖): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/cyborg-ui/shots2/` — `cyborg-ui-combat-{폭}-{테마}-{언어}`(상세 전투 스펙 접음), `cyborg-ui-combat-open-…`(HP·회피·크리 배율 펼침), `cyborg-ui-pop-…`(VIT 출처 상세: 몸 값 + 시험 인공 심장), `cyborg-ui-…`·`cyborg-ui-open-…`(화면 전체), `cyborg-ui-hero-…`, `cyborg-ui-worst-390-{ko,en}`. 390은 파스텔·다크·정거장, 1440은 파스텔·다크, 한국어·영어.

## 사용자 결정 대기
- 없음.
