import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isHostedImageUrl } from './hosted-image-url'

afterEach(() => vi.unstubAllEnvs())

describe.each(['almostcrackd.ai', 'crackd.ai'])('image URLs for %s', (domain) => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', `https://api.${domain}`))

  it('accepts the current environment canonical CDN with exact hostname matching', () => {
    expect(isHostedImageUrl(`https://images.${domain}/user/image.jpg?width=640`)).toBe(true)
    expect(isHostedImageUrl(`https://IMAGES.${domain.toUpperCase()}/user/image.jpg`)).toBe(true)
  })

  it('requires the other environment image CDN to be copied', () => {
    const otherDomain = domain === 'crackd.ai' ? 'almostcrackd.ai' : 'crackd.ai'
    expect(isHostedImageUrl(`https://images.${otherDomain}/user/image.jpg`)).toBe(false)
  })

  it.each([
    'https://presigned-url-uploads.almostcrackd.ai/image.jpg',
    'https://presigned-url-uploads.crackd.ai/image.jpg',
    'https://d1ic6qbbjkrjqg.cloudfront.net/image.jpg',
    'https://d1qf4mdnikoyox.cloudfront.net/image.jpg',
    'https://nonchalant-production-imagesbucket-sfboeefk.s3.us-east-1.amazonaws.com/image.jpg',
    'https://nonchalant-staging-imagesbucket-bsrcknok.s3.amazonaws.com/image.jpg',
    'https://secure.almostcrackd.ai/storage/v1/object/public/images/image.jpg',
    'https://secure.crackd.ai/storage/v1/object/public/images/image.jpg',
    'https://qihsgnfjqmkjmoowyfbn.supabase.co/storage/v1/object/public/images/image.jpg',
    'https://kglxxmrvmrxiyigarjfh.supabase.co/storage/v1/object/sign/images/image.jpg?token=example',
    'https://example.com/image.jpg',
    'https://images.crackd.ai.example.com/image.jpg',
    'https://images.crackd.ai@evil.example/image.jpg',
    'https://evil.example/image.jpg?url=https://images.crackd.ai/image.jpg',
    'https://other.supabase.co/storage/v1/object/public/images/image.jpg',
    'https://secure.crackd.ai/rest/v1/images',
    'https://www.crackd.ai/caption/example',
    'https://images.crackd.ai:1234/image.jpg',
    'https://user:password@images.crackd.ai/image.jpg',
    'http://images.crackd.ai/image.jpg',
    'http://images.almostcrackd.ai/image.jpg',
    'data:image/png;base64,AAAA',
    'ftp://images.crackd.ai/image.jpg',
    'not a URL',
  ])('requires a copy of noncanonical URL %s', (url) => {
    expect(isHostedImageUrl(url)).toBe(false)
  })
})

it('matches the upload action staging fallback when no API URL is configured', () => {
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '')
  expect(isHostedImageUrl('https://images.almostcrackd.ai/image.jpg')).toBe(true)
  expect(isHostedImageUrl('https://images.crackd.ai/image.jpg')).toBe(false)
})

it.each(['https://api.unknown.example', 'invalid URL'])('does not guess an image host for API configuration %s', (baseUrl) => {
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', baseUrl)
  expect(isHostedImageUrl('https://images.almostcrackd.ai/image.jpg')).toBe(false)
  expect(isHostedImageUrl('https://images.crackd.ai/image.jpg')).toBe(false)
})
