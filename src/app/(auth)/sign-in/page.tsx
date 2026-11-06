import Link from "next/link";
import { signInAction } from "@/app/actions";
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

export default async function Signin(props: {
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
					<CardTitle className="text-2xl">Log In</CardTitle>
					<CardDescription>
						Enter your details below to log in to your account
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="flex flex-col gap-6">
						<div className="grid gap-2">
							<Label htmlFor="email">Email</Label>
							<Input name="email" placeholder="you@example.com" required />
						</div>
						<div className="grid gap-2">
							<Label htmlFor="password">Password</Label>
							<Input
								type="password"
								name="password"
								placeholder="Your password"
								required
							/>
							<Link
								className="text-xs text-foreground underline underline-offset-4"
								href="/forgot-password"
							>
								Forgot Password?
							</Link>
						</div>
						<SubmitButton formAction={signInAction} pendingText="Signing in...">
							Log In
						</SubmitButton>
						<FormMessage message={searchParams} />
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
