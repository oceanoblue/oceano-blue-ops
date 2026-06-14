/** @type {import('next').NextConfig} */
const nextConfig = {
  // TypeScript errors now FAIL the build (the supabase-js typing skew that
  // forced this off has been fixed — the DB layer is strictly typed and tsc is
  // clean). ESLint is still skipped at build time because no eslint config is
  // set up yet (separate task); strict types are the guarantee that matters.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
    ],
  },
};

module.exports = nextConfig;
