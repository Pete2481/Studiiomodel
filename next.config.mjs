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
    ],
  },
};

export default nextConfig;

