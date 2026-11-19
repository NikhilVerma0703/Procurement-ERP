/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdfmake (and pdfkit under it) load binary assets when imported, so they
  // stay outside the webpack bundle — as in the Main ERP's next.config.mjs.
  serverExternalPackages: ["pdfmake", "@foliojs-fork/fontkit"],
};

export default nextConfig;
