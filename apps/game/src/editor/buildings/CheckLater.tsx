// 입력이 멈춘 뒤 한 번 부르기 — key가 바뀔 때마다 새로 붙어 delay 뒤에 run을 한 번 부른다(건물 편집기의 서버 검사).
// 붙을 때의 run을 들고 있으므로 효과 의존성이 바뀌지 않는다. 아이템 편집기 DebouncedTask와 같은 것이다(그 조각을 끌고 오지 않게 따로 둔다).
import { useEffect, useState } from "react";

export function CheckLater({ delay, run }: { delay: number; run: () => void }) {
  const [task] = useState(() => run);
  useEffect(() => {
    const timer = setTimeout(task, delay);
    return () => clearTimeout(timer);
  }, [task, delay]);
  return null;
}
