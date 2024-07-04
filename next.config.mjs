import {execSync} from 'child_process';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  webpack: (config, {dev, isServer}) => {
    if (isServer && !dev) {
      execSync('npm run prepare-images', {stdio: 'inherit'});
    }
    return config;
  },

  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../'),

    turbo: {
      resolveAlias: {
        'image-set': path.resolve(__dirname, 'node_modules/image-set'),
      },
      loaders: {
        '.png': ['file-loader'],
        '.jpg': ['file-loader'],
        '.jpeg': ['file-loader'],
        '.gif': ['file-loader'],
        '.svg': ['file-loader'],
        '.webp': ['file-loader'],
      },
    },
  },
};

export default nextConfig;
