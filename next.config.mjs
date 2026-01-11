/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '*.dropboxusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'www.dropbox.com',
      },
      {
        protocol: 'https',
        hostname: 'dl.dropboxusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'dropbox.com',
      },
      {
        protocol: 'https',
        hostname: 'studiio-assets.s3.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'drive.google.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
    localPatterns: [
      {
        pathname: '/api/dropbox/assets/**',
      },
      {
        pathname: '/api/google-drive/assets/**',
      },
    ],
    minimumCacheTTL: 31536000,
  },
};

export default nextConfig;

