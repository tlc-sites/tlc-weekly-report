"use client";

import { useEffect, useRef, useState } from "react";
import { MemberPhoto } from "./member-photo";

export function PhotoInput({ initial, name }: { initial: string | null; name: string }) {
  const [photo, setPhoto] = useState(initial ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fieldset = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    const form = fieldset.current?.form;
    if (!form || !loading) return;
    const waitForPhoto = (event: Event) => { event.preventDefault(); setError("사진 준비가 끝난 뒤 저장해 주세요."); };
    form.addEventListener('submit', waitForPhoto);
    return () => form.removeEventListener('submit', waitForPhoto);
  }, [loading]);
  return <fieldset ref={fieldset} className="flex flex-col gap-2">
    <legend className="mb-2 text-sm font-medium">인물 사진</legend>
    <MemberPhoto name={name} photo={photo} large />
    <input type="hidden" name="photoData" value={photo} />
    <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="인물 사진 선택" disabled={loading} onChange={async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError("JPG, PNG, WebP 사진을 10MB 이하로 선택해 주세요."); return; }
      setLoading(true); setError("");
      try {
        // 작은 썸네일로 변환해 원본과 사진 위치 정보를 저장하지 않는다.
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d'); if (!ctx) throw new Error();
        const side = Math.min(bitmap.width, bitmap.height);
        ctx.drawImage(bitmap, (bitmap.width-side)/2, (bitmap.height-side)/2, side, side, 0, 0, 256, 256);
        bitmap.close();
        const result = canvas.toDataURL('image/jpeg', 0.8);
        if (result.length > 200000) throw new Error();
        setPhoto(result);
      } catch { setError("사진을 읽지 못했습니다. 다른 사진을 선택해 주세요."); }
      finally { setLoading(false); }
    }} />
    {loading ? <p role="status">사진을 준비하고 있습니다. 완료 후 저장해 주세요.</p> : null}
    {photo ? <button type="button" className="self-start text-sm underline" onClick={() => setPhoto("")}>사진 지우기</button> : null}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
  </fieldset>;
}
