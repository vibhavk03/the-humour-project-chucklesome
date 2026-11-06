import CaptionDetailsPage from "@/components/caption-details/CaptionDetailsPage";

export default async function CaptionDetailRoute({
  params,
}: {
  params: Promise<{ captionId: string }>;
}) {
  const { captionId } = await params;

  return <CaptionDetailsPage captionId={captionId} />;
}
