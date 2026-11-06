export async function sha256Hex(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto SHA-256 support is not available in this browser.");
  }

  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function clientSecretHashFromSecret(
  secret: string | null,
): Promise<string | null> {
  return secret === null ? null : sha256Hex(secret);
}
