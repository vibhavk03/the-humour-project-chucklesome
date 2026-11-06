import ImageDetailsPage from "@/components/image-details/ImageDetailsPage";

export default async function ImageDetailRoute({
  params,
}: {
  params: Promise<{ imageId: string }>;
}) {
  const { imageId } = await params;

  return <ImageDetailsPage imageId={imageId} />;
}
