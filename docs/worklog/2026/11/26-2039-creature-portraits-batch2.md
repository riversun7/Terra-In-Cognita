# 크리쳐 일러스트 이어서 생성 (12지신 완성 + 기린 12종)

- 일시: 2026-11-26 20:39 (KST)
- 작업 도구: Antigravity
- 관련: 앞 작업 `docs/worklog/2026/11/25-2308-creature-editor-classes-catalog-models-art.md`

## 한 일
이미지 생성 한도 초기화 뒤 남은 12지신과 동양 신수 일러스트 12종을 이어서 생성해 도감에 연결했다(현재 전체 388종 중 114종 이미지 보유, 274종 남음).

1. **12지신 동물형 나머지 6종 완성 (12/12 완료)**:
   - `ZODIAC_SNAKE.jpg` (`zodiac_snake`), `ZODIAC_GOAT.jpg` (`zodiac_goat`), `ZODIAC_MONKEY.jpg` (`zodiac_monkey`), `ZODIAC_ROOSTER.jpg` (`zodiac_rooster`), `ZODIAC_DOG.jpg` (`zodiac_dog`), `ZODIAC_BOAR.jpg` (`zodiac_boar`).
2. **12지신 환생 인간형 화신 5종 추가 (10/12 완료)**:
   - `ZODIAC_RABBIT_AVATAR.jpg` (`zodiac_rabbit_avatar`), `ZODIAC_HORSE_AVATAR.jpg` (`zodiac_horse_avatar`), `ZODIAC_GOAT_AVATAR.jpg` (`zodiac_goat_avatar`), `ZODIAC_MONKEY_AVATAR.jpg` (`zodiac_monkey_avatar`), `ZODIAC_ROOSTER_AVATAR.jpg` (`zodiac_rooster_avatar`).
3. **동양 신수 1종 추가**:
   - `QILIN.jpg` (`qilin`).
4. **크기 최적화·연결**: 12종 모두 512×512 JPEG(`sips -Z 512`, 74~100 KB)로 맞춰 `apps/game/public/creatures/`에 넣고 `content/core/creatures.json`의 `image`·`portraitCrop`을 연결했다. `content/core/manifest.json` 판을 `core@160 → 161`로 올렸다.
5. **한도 도달로 나머지 스킵**: `zodiac_dog_avatar`, `zodiac_boar_avatar`, `yellow_dragon`, `haetae` 시도 중 이미지 생성 모델 한도(`HTTP 429 RESOURCE_EXHAUSTED`, 약 5시간 뒤 초기화)에 도달해 중단했다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/public/creatures/ZODIAC_*.jpg` (11개), `QILIN.jpg` (1개) | 신규 512×512 크리쳐 일러스트 12종 |
| `content/core/creatures.json`, `content/core/manifest.json` | 12종 `image`·`portraitCrop` 연결, 팩 판 `core@161` |

## 함께 바꿔야 하는 파일
- 다음 한도 초기화 뒤 `zodiac_dog_avatar`, `zodiac_boar_avatar`로 12지신 24종을 마무리하고, 황룡(`yellow_dragon`)·해태(`haetae`)·구미호(`gumiho`)·사흉·황도 12궁 순으로 이어서 생성한다.

## 건드리지 말 것
- 기존 91종 이미지·ID와 이미 연결된 12지신 이미지.

## 미검증·TODO·알려진 문제
- **Verified** `pnpm biome format` 통과, `node scripts/check-content.mjs` 통과(`core@161`, 1·2·4a·4b 호환 검사 포함), `apps/server/src/creatureEdit/views.test.ts` 통과(388종 전체 왕복 일치).
- **미실행** 코드 로직·CSS 변경이 없어 `pnpm check` 전체와 화면 시험(E2E)은 다시 돌리지 않았다.
- 커밋하지 않았다.

## 사용자 결정 대기
- 없음.

- 커밋 때(2026-11-27) 팩 판은 162다: 그 사이 다른 커밋이 161까지 써서 호환 검사에 맞춰 한 번 더 올렸다. 깨끗한 작업 복사본에서 `pnpm check`·`check:content`·`check-pwa`·`check:bundle`, 화면 시험 `e2e/creatureDex.spec.ts`가 통과했다(Claude Code가 대신 확인·커밋).
