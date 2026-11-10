// 크리처 원형 초상화 배지(CreatureTokenBadge) — 원본 그림 한 장과 원 좌표(cxPm·cyPm·radiusPm)만으로 그린다(잘라 낸 그림 파일 없음).
// 그림 자리는 @terra/shared/portraitCrop의 portraitImageStyle 하나로 정한다(선택기 원·미리보기·목록·상세 머리가 같은 계산).
// 그림 높이는 정하지 않는다(height: auto) → 정사각이 아닌 그림도 비율 그대로 놓인다.
import {
  CREATURE_DEFAULT_PORTRAIT_CROP,
  type CreatureGrade,
  type CreaturePortraitCrop,
  resolveCreatureImageUrl,
} from "@terra/shared/creatureEditor";
import { portraitImageStyle } from "@terra/shared/portraitCrop";

export function CreatureTokenBadge({
  image,
  crop = CREATURE_DEFAULT_PORTRAIT_CROP,
  grade = "common",
  sizePx = 44,
  alt = "",
}: {
  readonly image: string | undefined;
  readonly crop?: CreaturePortraitCrop | undefined;
  readonly grade?: CreatureGrade | undefined;
  /** 배지 바깥 지름(테두리 포함, CSS px) */
  readonly sizePx?: number | undefined;
  readonly alt?: string | undefined;
}) {
  const url = resolveCreatureImageUrl(image);
  return (
    <span
      className="ce-creature-token"
      data-grade={grade}
      style={{ width: `${sizePx}px`, height: `${sizePx}px` }}
      title={alt}
    >
      {url ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          draggable={false}
          className="ce-creature-token-img"
          style={portraitImageStyle(crop)}
        />
      ) : (
        <span className="ce-creature-token-empty" aria-hidden="true">
          ?
        </span>
      )}
    </span>
  );
}
