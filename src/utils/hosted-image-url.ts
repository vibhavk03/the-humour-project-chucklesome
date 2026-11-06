const imageHostByApiHost: Record<string, string> = {
  'api.almostcrackd.ai': 'images.almostcrackd.ai',
  'api.crackd.ai': 'images.crackd.ai',
}

// Only the canonical image CDN for the API's environment can be registered
// directly. Other environments and storage aliases must go through that API.
export function isHostedImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    // Match the same configuration and staging fallback used by upload actions.
    const apiUrl = new URL(
      process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.almostcrackd.ai'
    )
    const imageHost = imageHostByApiHost[apiUrl.hostname]
    return (
      url.protocol === 'https:' &&
      !url.username && !url.password && !url.port &&
      url.hostname === imageHost
    )
  } catch {
    return false
  }
}
