import {z} from "zod";
import {requireActive} from "@/lib/auth";

// 알림 읽음 처리. 서버 액션은 화면 이동과 같은 줄에 서서 이동을 늦추므로, 알림을 누르는 순간 따로 보낸다.
// 다른 사람 알림은 read_notification이 거른다(본인 알림만 바뀐다).
// {id}: 그 알림 하나. {path}: 그 화면(보고서 등)을 가리키는 내 안 읽은 알림 모두(주소 뒤 #comments 등 포함).
const PATH = /^\/(reports|incidents|notices|messages)\/[0-9a-f-]{36}$/i;
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response("forbidden", {status: 403});
  const parsed = z.union([z.object({id: z.uuid()}), z.object({path: z.string().regex(PATH)})]).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("bad request", {status: 400});
  const {supabase} = await requireActive();
  if ("id" in parsed.data) {
    const {error} = await supabase.rpc("read_notification", {p_id: parsed.data.id});
    return new Response(null, {status: error ? 500 : 204});
  }
  const path = parsed.data.path;
  const {data, error} = await supabase.from("inbox_notifications").select("id").is("read_at", null)
    .or(`url.eq."${path}",url.like."${path}#*",url.like."${path}?*"`).limit(50);
  if (error) return new Response(null, {status: 500});
  const results = await Promise.all((data ?? []).map(n => supabase.rpc("read_notification", {p_id: n.id})));
  if (results.some(r => r.error)) return new Response(null, {status: 500});
  return Response.json({read: data?.length ?? 0});
}
