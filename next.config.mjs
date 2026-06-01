/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a fully static site into out/ so Capacitor can bundle it into the
  // native Android app. The app is entirely client-side, so this is safe.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
