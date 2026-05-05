/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@vardnara/ui', '@vardnara/utils', '@vardnara/types'],
  experimental: {
    typedRoutes: true,
  },
}

export default nextConfig
