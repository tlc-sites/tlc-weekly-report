import {Suspense} from "react";
import {BackLink,Loading,PageTitle} from "@/components/ui";
import {NotificationList} from "@/components/notification-list";
import {requireActive,canManage,isClergy} from "@/lib/auth";
import {loadNotifications} from "./actions";
export default function Page(){return <Suspense fallback={<Loading/>}><Content/></Suspense>;}
async function Content(){const {profile}=await requireActive();const items=await loadNotifications();return <><BackLink href="/">홈</BackLink><PageTitle sub="알림을 누르면 해당 내용으로 바로 이동합니다.">알림</PageTitle><NotificationList items={items} userId={profile.id} staff={canManage(profile)||isClergy(profile)}/></>;}
