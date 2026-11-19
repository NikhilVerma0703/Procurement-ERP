// The list's Excel export: every PO the list's filters match, in its order —
// one sheet of POs and one of their item rows (the old site's users exported
// item columns too: their saved report views include Item Name and Qty).
import "server-only";
import ExcelJS from "exceljs";
import { siteToday } from "../format";
import { PO_STATUS_KEYS, labelOf } from "./labels";
import type { ListQuery } from "./list";
import { ordersForExport, WORKFLOW_LABEL } from "./queries";

const IST_MS = 330 * 60000;
const MONEY = "#,##0.00#";
const DATE = "dd-mm-yyyy";
const DATETIME = "dd-mm-yyyy hh:mm:ss";

const num = (v: { toString(): string } | null | undefined) => (v == null ? null : Number(v.toString()));
/** Excel has no time zones: a moment is written as the old site's (IST) wall-clock time. */
const wallClock = (d: Date) => new Date(d.getTime() + IST_MS);

export async function buildOrdersWorkbook(q: ListQuery, ids?: readonly string[]): Promise<{ buffer: ArrayBuffer; filename: string }> {
  const orders = await ordersForExport(q, ids);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Procurement ERP";
  wb.created = new Date();

  const po = wb.addWorksheet("Purchase Order", { views: [{ state: "frozen", ySplit: 1 }] });
  po.columns = [
    { header: "ID", key: "id", width: 22 },
    { header: "Supplier", key: "supplier", width: 32 },
    { header: "Supplier Name", key: "supplierName", width: 32 },
    { header: "Date", key: "date", width: 12, style: { numFmt: DATE } },
    { header: "Required By", key: "requiredBy", width: 12, style: { numFmt: DATE } },
    { header: "Workflow State", key: "workflowState", width: 14 },
    { header: "Status", key: "status", width: 20 },
    { header: "Currency", key: "currency", width: 9 },
    { header: "Net Total", key: "netTotal", width: 16, style: { numFmt: MONEY } },
    { header: "Total Taxes and Charges", key: "taxes", width: 16, style: { numFmt: MONEY } },
    { header: "Grand Total", key: "grandTotal", width: 16, style: { numFmt: MONEY } },
    { header: "Rounded Total", key: "roundedTotal", width: 16, style: { numFmt: MONEY } },
    { header: "% Received", key: "perReceived", width: 11, style: { numFmt: "0.##" } },
    { header: "% Billed", key: "perBilled", width: 11, style: { numFmt: "0.##" } },
    { header: "Company", key: "company", width: 30 },
    { header: "Tax Category", key: "taxCategory", width: 13 },
    { header: "Created By", key: "createdBy", width: 30 },
    { header: "Created On", key: "createdOn", width: 19, style: { numFmt: DATETIME } },
    { header: "Last Updated On", key: "updatedOn", width: 19, style: { numFmt: DATETIME } },
  ];

  const items = wb.addWorksheet("Purchase Order Item", { views: [{ state: "frozen", ySplit: 1 }] });
  items.columns = [
    { header: "Purchase Order", key: "po", width: 22 },
    { header: "No.", key: "idx", width: 6 },
    { header: "Item Code", key: "itemCode", width: 32 },
    { header: "Item Name", key: "itemName", width: 36 },
    { header: "Quantity", key: "qty", width: 11, style: { numFmt: "#,##0.###" } },
    { header: "UOM", key: "uom", width: 9 },
    { header: "Rate", key: "rate", width: 14, style: { numFmt: MONEY } },
    { header: "Amount", key: "amount", width: 16, style: { numFmt: MONEY } },
    { header: "Required By", key: "requiredBy", width: 12, style: { numFmt: DATE } },
    { header: "Received Qty", key: "receivedQty", width: 12, style: { numFmt: "#,##0.###" } },
    { header: "Warehouse", key: "warehouse", width: 28 },
  ];

  for (const o of orders) {
    po.addRow({
      id: o.number,
      supplier: o.supplier.code,
      supplierName: o.supplierName,
      date: o.transactionDate,
      requiredBy: o.scheduleDate,
      workflowState: WORKFLOW_LABEL[o.workflowState],
      status: labelOf(PO_STATUS_KEYS, o.status),
      currency: o.currency,
      netTotal: num(o.netTotal),
      taxes: num(o.totalTaxesAndCharges),
      grandTotal: num(o.grandTotal),
      roundedTotal: num(o.roundedTotal),
      perReceived: num(o.perReceived),
      perBilled: num(o.perBilled),
      company: o.company.code,
      taxCategory: o.taxCategory?.code ?? null,
      createdBy: o.createdBy,
      createdOn: wallClock(o.createdAt),
      updatedOn: wallClock(o.updatedAt),
    });
    for (const i of o.items) {
      items.addRow({
        po: o.number,
        idx: i.idx,
        itemCode: i.itemCode,
        itemName: i.itemName,
        qty: num(i.qty),
        uom: i.uom,
        rate: num(i.rate),
        amount: num(i.amount),
        requiredBy: i.scheduleDate,
        receivedQty: num(i.receivedQty),
        warehouse: i.warehouse?.code ?? null,
      });
    }
  }
  for (const ws of [po, items]) {
    ws.getRow(1).font = { bold: true };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  }

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return { buffer, filename: `Purchase Order ${siteToday()}.xlsx` };
}
