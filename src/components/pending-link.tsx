"use client";
import Link,{useLinkStatus} from "next/link";
import type {ComponentProps} from "react";
function NavigationStatus(){const {pending}=useLinkStatus();return pending?<span role="status" className="pointer-events-none fixed left-1/2 top-20 z-[70] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-accent/20 bg-surface px-4 py-2 text-sm font-medium text-accent shadow-lg"><span aria-hidden className="size-4 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin"/>화면을 여는 중…</span>:null;}
export default function PendingLink({children,...props}:ComponentProps<typeof Link>){return <Link {...props}>{children}<NavigationStatus/></Link>;}
