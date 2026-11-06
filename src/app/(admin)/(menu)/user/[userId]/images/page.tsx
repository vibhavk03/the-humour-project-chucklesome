import ImagesClient from "@/app/(admin)/(menu)/images/ImagesClient";

export default async function UserImagesRoute({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  return (
    <ImagesClient
      source="user-uploaded"
      profileId={userId}
      title="User Images"
      subtitle={`Images uploaded by user ${userId}.`}
    />
  );
}
