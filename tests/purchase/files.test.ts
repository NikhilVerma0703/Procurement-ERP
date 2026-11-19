// Step 9: the file store's places (lib/purchase/file-paths.ts). A stored row or a URL can only ever
// name a place under files/public or files/private, as the folder store kept files inside its root.
import { describe, expect, it } from "vitest";
import { safeStorePath, storePathOfUrl } from "@/lib/purchase/file-paths";

describe("file store places", () => {
  it("map the old site's URLs to their places", () => {
    expect(storePathOfUrl("/files/logo.png")).toBe("files/public/logo.png");
    expect(storePathOfUrl("/private/files/Quote 7.pdf")).toBe("files/private/Quote 7.pdf");
    expect(storePathOfUrl("/private/files/Quote%207.pdf")).toBe("files/private/Quote 7.pdf");
    expect(storePathOfUrl("/files/bad%E0.pdf")).toBe("files/public/bad%E0.pdf");
  });

  it("refuse anything that would leave the store or is not one of its URLs", () => {
    expect(storePathOfUrl("/files/../secret.txt")).toBeNull();
    expect(storePathOfUrl("/files/%2e%2e/secret.txt")).toBeNull();
    expect(storePathOfUrl("https://example.com/files/x.png")).toBeNull();
    expect(storePathOfUrl("/api/purchase/attachments/1")).toBeNull();
    expect(safeStorePath("files/private/a/../../b")).toBeNull();
    expect(safeStorePath("files/other/x")).toBeNull();
    expect(safeStorePath("files/public/a\\b")).toBeNull();
    expect(safeStorePath("files/public//x")).toBeNull();
    expect(safeStorePath("files/public/sub/x.pdf")).toBe("files/public/sub/x.pdf");
  });
});
