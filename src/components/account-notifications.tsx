import {getSessionProfile,canManage,isClergy} from "@/lib/auth";
import {NotificationBell} from "./notification-bell";
export async function AccountNotifications(){const {profile}=await getSessionProfile();return profile?.status==="active"?<NotificationBell userId={profile.id} staff={canManage(profile)||isClergy(profile)}/>:null;}
