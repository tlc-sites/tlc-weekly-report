import { Suspense } from "react";
import Link from "@/components/pending-link";
import { redirect } from "next/navigation";
import { Card, Loading, PageTitle } from "@/components/ui";
import { SignOutButton } from "@/components/signout-button";
import { getSessionProfile } from "@/lib/auth";

export default function PendingPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PendingContent />
    </Suspense>
  );
}

async function PendingContent() {
  const { profile } = await getSessionProfile();
  if (!profile) redirect("/login");
  if (profile.status === "active") redirect("/");
  if (profile.requested_group_ids.length === 0) redirect("/onboarding");

  const disabled = profile.status === "disabled";

  return (
    <>
      <PageTitle>{disabled ? "사용이 중지된 계정" : "승인 대기 중"}</PageTitle>
      <Card className="flex flex-col gap-3 text-sm leading-relaxed">
        {disabled ? (
          <p>이 계정은 사용이 중지되었습니다. 다시 사용하려면 관리자에게 문의해 주세요.</p>
        ) : (
          <>
            <p>
              <strong>{profile.real_name}</strong>님의 가입 신청이 접수되었습니다. 관리자가 승인하면 바로 사용할 수
              있습니다.
            </p>
            <Link href="/onboarding" className="text-accent underline underline-offset-4">
              신청 내용 수정
            </Link>
          </>
        )}
      </Card>
      <div className="mt-6">
        <SignOutButton />
      </div>
    </>
  );
}
