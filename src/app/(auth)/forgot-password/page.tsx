import Link from "next/link";

import { forgotPasswordAction } from "@/app/actions";
import { FormMessage, type Message } from "@/components/FormMessage";
import { SubmitButton } from "@/components/button/SubmitButton";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthRedirect } from "@/components/AuthRedirect";

export default async function ForgotPassword(props: {
	searchParams: Promise<Message>;
}) {
	const searchParams = await props.searchParams;
	if ("message" in searchParams) {
		return (
			<div className="page-shell mx-auto mt-6 flex max-w-md flex-col items-center text-center">
				<FormMessage message={searchParams} />
				<AuthRedirect />
			</div>
		);
	}

	return (
		<div className="page-shell mx-auto mt-6 flex max-w-md flex-col items-center">
			<AuthRedirect />
			<Card className="w-full">
				<CardHeader>
					<CardTitle className="text-2xl">Reset Password</CardTitle>
					<CardDescription>
						Enter your email below to reset your password
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="flex flex-col gap-6">
						<div className="grid gap-2">
							<Label htmlFor="email">Email</Label>
							<Input name="email" placeholder="you@example.com" required />
						</div>
						<SubmitButton
							formAction={forgotPasswordAction}
							pendingText="Resetting..."
						>
							Reset Password
						</SubmitButton>
						<FormMessage message={searchParams} />
					</form>
					<div className="mt-4 text-center text-sm">
						Already have an account?{" "}
						<Link className="underline underline-offset-4" href="/sign-in">
							Sign in
						</Link>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
