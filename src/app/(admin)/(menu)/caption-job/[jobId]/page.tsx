import CaptionJobDetailsPage from '@/components/caption-jobs/CaptionJobDetailsPage';

export default async function CaptionJobRoute({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <CaptionJobDetailsPage jobId={jobId} />;
}
