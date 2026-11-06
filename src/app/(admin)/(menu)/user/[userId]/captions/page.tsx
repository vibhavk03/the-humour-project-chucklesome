import UserCaptionsPage from "@/components/captions/UserCaptionsPage";

export default async function UserCaptionsRoute({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  return <UserCaptionsPage userId={userId} />;
}
