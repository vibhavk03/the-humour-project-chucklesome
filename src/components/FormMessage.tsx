export type Message =
	| { success: string }
	| { error: string }
	| { message: string };

export function FormMessage({ message }: { message: Message }) {
	return (
		<div className="flex flex-col gap-2 w-full max-w-md text-sm">
			{"success" in message && (
				<div className="text-primary border-l-2 border-primary/60 px-4">
					{message.success}
				</div>
			)}
			{"error" in message && (
				<div className="text-destructive font-normal border-l-2 border-destructive px-4">
					{message.error}
				</div>
			)}
			{"message" in message && (
				<div className="text-muted-foreground border-l-2 border-border px-4">
					{message.message}
				</div>
			)}
		</div>
	);
}
