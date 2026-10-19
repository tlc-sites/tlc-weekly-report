import Image from "next/image";

export function MemberPhoto({ photo, name, large = false }: { photo?: string | null; name: string; large?: boolean }) {
  const size = large ? 160 : 56;
  return photo ? <Image src={photo} alt={`${name} 사진`} width={size} height={size} unoptimized className={`${large ? "size-40" : "size-14"} shrink-0 rounded-2xl object-cover`} /> :
    <span role="img" aria-label={`${name} 사진 없음`} className={`${large ? "size-40 text-5xl" : "size-14 text-xl"} flex shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent`}>{name.slice(0, 1)}</span>;
}
