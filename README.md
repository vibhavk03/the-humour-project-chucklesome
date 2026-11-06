# Chucklesome

A Next.js project built with modern web technologies.

## Getting Started

### Prerequisites

- Node.js >= 24 < 25
- npm >= 11 < 12  

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) with your browser to see the result.

The development command allows up to 64 KiB of HTTP headers. Browsers share
localhost cookies across ports, so signing in to several local apps can exceed
Node.js's default 16 KiB limit and cause HTTP 431 after login. Restart
`npm run dev` after changing this setting.

Quick Study imports and External Image Replacement Jobs use the hosted
nonchalant API, including when this admin app runs locally. Set
`NEXT_PUBLIC_API_BASE_URL=https://api.almostcrackd.ai` alongside the staging
Supabase URL and public key for local development. Sign in at
`http://localhost:3001`; job requests send that user's JWT to the API, and the
staging queue and workers process uploaded images. No local AWS credentials or
worker process are needed. To connect to production instead, use the production
API and matching production Supabase configuration together. Restart the dev
server after changing environment variables.

The reviewed image reuse migration can be applied with
`node scripts/migrate-external-image-replacement-jobs.mjs staging --apply --reuse-uploaded-images`
(use `production` for production). The runner checks the prerequisite migration,
save function, index, permissions, and recorded SQL. Use `--verify` to check an
installed migration, or `--smoke` to exercise caption creation and image reuse
in a transaction that rolls back. These operations reuse the saved Supabase
CLI login; the admin app continues using the signed-in user's JWT.

## Development Workflow

### Code Quality

Run linting to ensure code quality:

```bash
npm run lint
```

### Before Opening PRs

Always build the project to ensure it compiles correctly:

```bash
npm run build
```

### Deployment

This app is deployed with AWS Amplify Hosting through a console-managed GitHub
App connection. Amplify uses the committed root `amplify.yml` build spec.

Applications:

- Staging: `chucklesome-staging`, connected to the `staging` branch and served
  from `https://admin.almostcrackd.ai`
- Production: `chucklesome-production`, connected to the `main` branch and
  served from `https://admin.crackd.ai`

One-time setup:

1. Install the Amplify GitHub App for `us-east-1` and grant it access to
   `The-Humor-Project/chucklesome`:
   `https://github.com/apps/aws-amplify-us-east-1/installations/new`
2. In the AWS Amplify console, choose **New app** -> **Host web app**.
3. Choose **GitHub** and select `The-Humor-Project/chucklesome`.
4. Create the staging app with app name `chucklesome-staging` and branch
   `staging`.
5. Create the production app with app name `chucklesome-production` and branch
   `main`.
6. Confirm Amplify uses the committed root `amplify.yml` build spec.
7. Add the custom domains in the Amplify console:
   - `admin.almostcrackd.ai` -> staging branch
   - `admin.crackd.ai` -> production branch

Required Amplify environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

Optional:

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_ENVIRONMENT`
- `NEXT_PUBLIC_APP_ENV`
- `NEXT_PUBLIC_SITE_TITLE`

Amplify must rebuild after environment values change. The root `amplify.yml`
writes all `NEXT_PUBLIC_*` Amplify environment variables into `.env.production`
before `next build` so they are available to the Next.js SSR runtime. The build
fails early if the required auth variables are missing from the selected
Amplify app or branch.

Add these redirect URLs in Google OAuth and Supabase auth settings:

- `https://admin.almostcrackd.ai/auth/callback`
- `https://admin.crackd.ai/auth/callback`

Keep the local callback URL for whichever dev port is used locally. This app
does not use a Supabase service-role key; all Supabase requests should use the
logged-in user's JWT.


## Technology Stack

### Core Framework

- [Next.js](https://nextjs.org) 16.x - React framework with App Router
- TypeScript - For type-safe code

### UI & Styling

- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [shadcn/ui](https://ui.shadcn.com/) - Component library built with Radix UI
- [Radix UI](https://www.radix-ui.com/) - Unstyled, accessible UI components
- [Lucide React](https://lucide.dev/) - Icon library
- [Framer Motion](https://www.framer.com/motion/) - Animation library
- [Embla Carousel](https://www.embla-carousel.com/) - Carousel component
- [Vaul](https://vaul.emilkowal.ski/) - Drawer component

### Data Management

- [Supabase](https://supabase.io/) - Backend as a Service (BaaS)
- [Recharts](https://recharts.org/) - Charting library

### Authentication

- [Google OAuth](https://developers.google.com/identity/protocols/oauth2) - via @react-oauth/google

### Developer Tools

- [AWS Amplify Hosting](https://aws.amazon.com/amplify/hosting/) - Hosting and deployments
- [ESLint](https://eslint.org/) - Code linting

## Deployment

The project is deployed with AWS Amplify Hosting.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com/docs)
