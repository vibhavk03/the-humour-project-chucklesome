import CaptionRequestDetailsPage from "@/components/caption-requests/CaptionRequestDetailsPage";

export default async function CaptionRequestDetailRoute({
  params,
}: {
  params: Promise<{ captionRequestId: string }>;
}) {
  const { captionRequestId } = await params;
  const requestId = Number(captionRequestId);

  return <CaptionRequestDetailsPage captionRequestId={requestId} />;
}
