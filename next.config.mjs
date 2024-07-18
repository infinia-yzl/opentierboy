import {execSync} from 'child_process';
import path from 'path';
import {fileURLToPath} from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCK_FILE = path.join(__dirname, '.prepare-images-lock');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  webpack: (config, {dev, isServer}) => {
    if (!dev && isServer) {
      // Check if we've already run the script
      if (!fs.existsSync(LOCK_FILE)) {
        console.log("Running prepare-images script...");
        execSync('npm run prepare-images', {stdio: 'inherit'});
        // Create a lock file to indicate the script has run
        fs.writeFileSync(LOCK_FILE, 'locked');
      }
    }
    return config;
  },

  transpilePackages: ['next-mdx-remote'],
};

export default nextConfig;
