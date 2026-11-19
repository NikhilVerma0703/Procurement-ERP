// A new address or contact made from a party's form (New Address / New
// Contact): the party it is linked to, and the page to go back to after its
// first save (address.js after_save returned to the party). Pure.

const PARTIES = ["Supplier", "Customer", "Company"];

export function partyPrefill(sp: Record<string, string | string[] | undefined>): { link: { doctype: string; name: string } | null; returnTo: string | null } {
  const one = (k: string) => {
    const x = sp[k];
    return ((Array.isArray(x) ? x[0] : x) ?? "").trim();
  };
  const doctype = one("link_doctype");
  const name = one("link_name").slice(0, 140);
  const back = one("return");
  return {
    link: PARTIES.includes(doctype) && name ? { doctype, name } : null,
    // Only a page of this module, so the parameter cannot send the user elsewhere.
    returnTo: /^\/purchase\/[A-Za-z0-9/_%-]*$/.test(back) ? back : null,
  };
}
