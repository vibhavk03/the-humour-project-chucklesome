import LlmPromptChainDetailsPage from "@/components/llm-prompt-chains/LlmPromptChainDetailsPage";

export default async function LlmPromptChainRoute({
  params,
}: {
  params: Promise<{ promptChainId: string }>;
}) {
  const { promptChainId } = await params;
  const chainId = Number(promptChainId);

  return <LlmPromptChainDetailsPage promptChainId={chainId} />;
}
