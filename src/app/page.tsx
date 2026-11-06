import { AuthRedirect } from "@/components/AuthRedirect";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { FormMessage, type Message } from "@/components/FormMessage";

export default async function LandingPage(props: {
  searchParams: Promise<Message>;
}) {
  const searchParams = await props.searchParams;

  return (
    <div className="page-shell mx-auto mt-6 flex max-w-xl flex-col items-center text-center">
      <AuthRedirect />
      <div className="page-header items-center">
        <p className="page-subtitle">A hub for managing the funny business.</p>
      </div>
      <div className="surface-card w-full max-w-sm">
        <div className="flex flex-col gap-4 items-center">
          <GoogleSignInButton />
          <FormMessage message={searchParams} />
        </div>
      </div>
    </div>
  );
}
