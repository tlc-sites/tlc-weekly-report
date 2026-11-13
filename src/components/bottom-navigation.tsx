import {getSessionProfile,isSenior} from "@/lib/auth";
import {BottomNavigationLinks} from "./bottom-navigation-links";
export async function BottomNavigation(){const {profile}=await getSessionProfile();if(profile?.status!=="active")return null;return <BottomNavigationLinks senior={isSenior(profile)}/>;}
