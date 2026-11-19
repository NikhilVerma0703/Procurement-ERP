// The largest file one upload may carry, shared by the upload dialog (browser) and the upload route
// (server). Pure.
//
// 4,000,000 bytes, as the Main ERP's Lab module (lib/lab/uploads.ts): Vercel refuses a request body
// near 4.5 MB, so the old site's 10 MB (Frappe's default) cannot pass there. Decision 3 of
// docs/11-acceptance.md, applied with its recommended default on 19-11-2026 for the move to Vercel.
// The 5 files on old POs are 344 KB at most.
export const MAX_ATTACHMENT_BYTES = 4_000_000;

/** Frappe's refusal, with this limit ("File size exceeded the maximum allowed size of {0} MB"). */
export const ATTACHMENT_TOO_BIG = `File size exceeded the maximum allowed size of ${(MAX_ATTACHMENT_BYTES / 1_000_000).toFixed(1)} MB`;

/** What a multipart request adds around the file (boundaries, headers, the privacy field). */
export const FORM_OVERHEAD_BYTES = 64 * 1024;
