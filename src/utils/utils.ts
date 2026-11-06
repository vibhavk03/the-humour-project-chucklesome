import { type ClassValue, clsx } from "clsx";
import { redirect } from "next/navigation";
import { twMerge } from "tailwind-merge";

export const encodedRedirect = (
	type: "error" | "success",
	path: string,
	message: string,
): never => {
	return redirect(`${path}?${type}=${encodeURIComponent(message)}`);
};

export const cn = (...inputs: ClassValue[]) => {
	return twMerge(clsx(inputs));
};

export function isUUID(term: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(term);
}