// A master page the signed-in user may not open as asked (a new record without the right to make one).
import Link from "next/link";
import { PageHeader } from "@/components/purchase/layout/PageHeader";

export function MasterRefused({ doctype, title, message, back }: { doctype: string; title: string; message: string; back: string }) {
  return (
    <>
      <PageHeader crumbs={["Buying", doctype]} title={title} />
      <section className="po-card p-8 text-center text-sm text-gray-600">
        <p className="font-medium text-gray-800">{message}</p>
        <Link href={back} className="mt-3 inline-block font-medium text-brand-700 hover:underline">
          Back to the list
        </Link>
      </section>
    </>
  );
}
