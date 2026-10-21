import {getSessionProfile} from "@/lib/auth";
import {NotificationBell} from "./notification-bell";
export async function AccountNotifications(){const {profile}=await getSessionProfile();return profile?.status==="active"?<NotificationBell/>:null;}
