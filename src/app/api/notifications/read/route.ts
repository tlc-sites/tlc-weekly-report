import {z} from "zod";
import {requireActive} from "@/lib/auth";

// 알림 읽음 처리. 서버 액션은 화면 이동과 같은 줄에 서서 이동을 늦추므로, 알림을 누르는 순간 따로 보낸다.
// 다른 사람 알림은 read_notification이 거른다(본인 알림만 바뀐다).
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response("forbidden", {status: 403});
  const parsed = z.object({id: z.uuid()}).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("bad request", {status: 400});
  const {supabase} = await requireActive();
  const {error} = await supabase.rpc("read_notification", {p_id: parsed.data.id});
  return new Response(null, {status: error ? 500 : 204});
}
