/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdfmake (and pdfkit under it) load binary assets when imported, so they
  // stay outside the webpack bundle — as in the Main ERP's next.config.mjs.
  // nunjucks (the receipt print formats, lib/purchase/print) is patched at its
  // runtime and has optional file-watcher imports: loaded by Node, not bundled.
  serverExternalPackages: ["pdfmake", "@foliojs-fork/fontkit", "nunjucks"],
};

export default nextConfig;
