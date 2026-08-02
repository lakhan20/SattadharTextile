import type { LowStockResult, StockValuationResponse } from '../stock/stock.service';
import type { ReportDocument } from './reports.export';
import { formatDayKey } from './reports.period';
import type {
  AgeingResult,
  CategorySalesResult,
  GstSummaryResult,
  OutstandingResult,
  PaymentCollectionResult,
  ProductSalesResult,
  ProfitMarginResult,
  SalesReportResult,
} from './reports.service';

/**
 * Turns each report's JSON into the printable `ReportDocument` the PDF and
 * Excel renderers share.
 *
 * This layer exists so the export never re-queries anything: what gets printed
 * is byte-for-byte the object the JSON caller received. A number can therefore
 * not differ between the screen and the sheet the owner mails to their CA.
 */

const rupees = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MODE_LABEL: Record<string, string> = { GST: 'Tax invoice', NON_GST: 'Estimate' };

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  BANK: 'Bank transfer',
  CHEQUE: 'Cheque',
  CARD: 'Card',
  CREDIT: 'Khata (credit)',
};

export function salesDocument(result: SalesReportResult): ReportDocument {
  const { totals } = result;
  return {
    slug: 'sales',
    title: 'Sales Report',
    range: result.range,
    orientation: 'landscape',
    summary: [
      { label: 'Total sales', value: rupees(totals.grandTotal) },
      { label: 'Bills', value: String(totals.billCount) },
      { label: 'GST collected', value: rupees(totals.gstCollected) },
      { label: 'Balance on khata', value: rupees(totals.dueAmount) },
    ],
    sections: [
      {
        title: 'By document type',
        columns: [
          { key: 'mode', header: 'Type', width: 120 },
          { key: 'billCount', header: 'Bills', width: 60, format: 'int' },
          { key: 'taxableValue', header: 'Taxable value', width: 110, format: 'money' },
          { key: 'gstCollected', header: 'GST', width: 100, format: 'money' },
          { key: 'grandTotal', header: 'Total', width: 110, format: 'money' },
        ],
        rows: result.byMode.map((row) => ({ ...row, mode: MODE_LABEL[row.mode] ?? row.mode })),
        totals: {
          mode: 'All',
          billCount: totals.billCount,
          taxableValue: totals.taxableValue,
          gstCollected: totals.gstCollected,
          grandTotal: totals.grandTotal,
        },
      },
      {
        title: 'Day by day',
        columns: [
          { key: 'date', header: 'Date', width: 110 },
          { key: 'billCount', header: 'Bills', width: 60, format: 'int' },
          { key: 'gstTotal', header: 'Tax invoices', width: 110, format: 'money' },
          { key: 'estimateTotal', header: 'Estimates', width: 110, format: 'money' },
          { key: 'total', header: 'Total', width: 110, format: 'money' },
        ],
        // Days with no trade are dropped from the printed table — a page of
        // zeroes is noise. The chart on screen keeps them, because a gap in a
        // line is information.
        rows: result.byDay
          .filter((day) => day.billCount > 0)
          .map((day) => ({ ...day, date: formatDayKey(day.date) })),
        totals: { date: 'Total', billCount: totals.billCount, total: totals.grandTotal },
        emptyText: 'No sales in this period.',
      },
      {
        title: 'Every bill',
        columns: [
          { key: 'billNumber', header: 'Bill no.', width: 110 },
          { key: 'billDate', header: 'Date', width: 80 },
          { key: 'billingMode', header: 'Type', width: 70 },
          { key: 'customerName', header: 'Customer', width: 150 },
          { key: 'staffName', header: 'Billed by', width: 100 },
          { key: 'itemCount', header: 'Items', width: 50, format: 'int' },
          { key: 'taxableValue', header: 'Taxable', width: 90, format: 'money' },
          { key: 'gstAmount', header: 'GST', width: 80, format: 'money' },
          { key: 'grandTotal', header: 'Total', width: 95, format: 'money' },
          { key: 'dueAmount', header: 'Due', width: 85, format: 'money' },
        ],
        rows: result.bills.map((bill) => ({
          ...bill,
          billDate: formatDayKey(bill.billDate.slice(0, 10)).slice(0, 6),
          billingMode: bill.billingMode === 'GST' ? 'Tax' : 'Est',
          customerName: bill.customerName ?? 'Walk-in',
        })),
        totals: { billNumber: 'Total', grandTotal: totals.grandTotal, dueAmount: totals.dueAmount },
        emptyText: 'No sales in this period.',
      },
    ],
    notes: [
      'Cancelled and draft bills are excluded from every figure.',
      result.truncated
        ? `Only the ${result.bills.length} most recent bills are listed individually. The summaries above cover the whole period.`
        : '',
      'Dates and totals follow the shop clock (Asia/Kolkata).',
    ].filter(Boolean),
  };
}

export function gstSummaryDocument(result: GstSummaryResult): ReportDocument {
  return {
    slug: 'gst-summary',
    title: 'GST Summary',
    subtitle: 'Tax invoices only. Estimates carry no GST and are excluded from these figures.',
    range: result.range,
    summary: [
      { label: 'Taxable value', value: rupees(result.totals.taxableValue) },
      { label: 'CGST + SGST', value: rupees(result.totals.cgstAmount + result.totals.sgstAmount) },
      { label: 'IGST', value: rupees(result.totals.igstAmount) },
      { label: 'Total tax payable', value: rupees(result.totals.totalTax) },
    ],
    sections: [
      {
        title: 'By GST rate',
        columns: [
          { key: 'gstPercent', header: 'Rate %', width: 70, format: 'percent' },
          { key: 'taxableValue', header: 'Taxable value', width: 130, format: 'money' },
          { key: 'cgstAmount', header: 'CGST', width: 105, format: 'money' },
          { key: 'sgstAmount', header: 'SGST', width: 105, format: 'money' },
          { key: 'igstAmount', header: 'IGST', width: 105, format: 'money' },
          { key: 'totalTax', header: 'Total tax', width: 115, format: 'money' },
        ],
        rows: result.byRate as unknown as Record<string, number>[],
        totals: { gstPercent: 'Total', ...result.totals },
        emptyText: 'No tax invoices in this period.',
      },
    ],
    notes: [
      `${result.gstBillCount} tax invoice(s) in this period.`,
      result.estimateValueExcluded > 0
        ? `${rupees(result.estimateValueExcluded)} of estimate sales is deliberately excluded — estimates are not tax invoices.`
        : '',
      'CGST + SGST applies to sales within Gujarat; IGST applies to inter-state sales.',
    ].filter(Boolean),
  };
}

export function stockValuationDocument(result: StockValuationResponse): ReportDocument {
  return {
    slug: 'stock-valuation',
    title: 'Stock Valuation',
    subtitle: 'Valued at cost price. Shop owner only.',
    summary: [
      { label: 'Value at cost', value: rupees(result.costValue) },
      { label: 'Value at retail', value: rupees(result.retailValue) },
      { label: 'Potential margin', value: rupees(result.potentialMargin) },
      { label: 'Low stock items', value: String(result.lowStockCount) },
    ],
    sections: [
      {
        title: 'By unit',
        columns: [
          { key: 'unit', header: 'Unit', width: 90 },
          { key: 'productCount', header: 'Products', width: 80, format: 'int' },
          { key: 'totalQty', header: 'Quantity on hand', width: 120, format: 'qty' },
          { key: 'costValue', header: 'Value at cost', width: 130, format: 'money' },
          { key: 'retailValue', header: 'Value at retail', width: 130, format: 'money' },
        ],
        rows: result.byUnit as unknown as Record<string, number | string>[],
        totals: {
          unit: 'Total',
          productCount: result.productCount,
          costValue: result.costValue,
          retailValue: result.retailValue,
        },
        emptyText: 'No products on the shelf.',
      },
    ],
    notes: [
      'Meters and pieces are never added together — a mixed quantity total would be meaningless.',
      'Inactive products are still counted: the money is on the shelf whether or not the product is currently offered.',
    ],
  };
}

export function lowStockDocument(result: LowStockResult, viewerIsAdmin: boolean): ReportDocument {
  return {
    slug: 'low-stock',
    title: 'Low Stock',
    subtitle: 'Products at or below their reorder level, worst shortfall first.',
    summary: [{ label: 'Products running low', value: String(result.pagination.total) }],
    sections: [
      {
        columns: [
          { key: 'name', header: 'Product', width: 180 },
          { key: 'sku', header: 'SKU', width: 110 },
          { key: 'unit', header: 'Unit', width: 60 },
          { key: 'currentStock', header: 'On hand', width: 90, format: 'qty' },
          { key: 'reorderLevel', header: 'Reorder at', width: 90, format: 'qty' },
          { key: 'shortBy', header: 'Short by', width: 90, format: 'qty' },
          { key: 'status', header: 'Status', width: 90 },
        ],
        rows: result.items.map((item) => ({
          name: item.name,
          sku: item.sku,
          unit: item.unit,
          currentStock: item.currentStock,
          reorderLevel: item.reorderLevel,
          shortBy: item.shortBy,
          status: item.outOfStock ? 'Out of stock' : 'Low',
        })),
        emptyText: 'Nothing is running low.',
      },
    ],
    // No cost column appears above for anyone — this report is open to staff,
    // and the underlying query selects no cost columns at all.
    notes: viewerIsAdmin ? ['Stock values are in the Stock Valuation report.'] : [],
  };
}

export function outstandingDocument(result: OutstandingResult): ReportDocument {
  return {
    slug: 'outstanding',
    title: 'Outstanding (Khata)',
    subtitle: 'What customers currently owe the shop.',
    summary: [
      { label: 'Total outstanding', value: rupees(result.totalOutstanding) },
      { label: 'Customers owing', value: String(result.customerCount) },
      { label: 'Over credit limit', value: String(result.overLimitCount) },
    ],
    sections: [
      {
        columns: [
          { key: 'name', header: 'Customer', width: 170 },
          { key: 'phone', header: 'Phone', width: 110 },
          { key: 'type', header: 'Type', width: 90 },
          { key: 'unpaidBillCount', header: 'Unpaid bills', width: 90, format: 'int' },
          { key: 'creditLimit', header: 'Credit limit', width: 110, format: 'money' },
          { key: 'outstanding', header: 'Outstanding', width: 120, format: 'money' },
          { key: 'overLimitBy', header: 'Over limit by', width: 110, format: 'money' },
        ],
        rows: result.customers as unknown as Record<string, string | number>[],
        totals: { name: 'Total', outstanding: result.totalOutstanding },
        emptyText: 'No customer owes anything.',
      },
    ],
    notes: ['Balances come from the customer ledger, kept in step with every credit sale as it is billed.'],
  };
}

export function ageingDocument(result: AgeingResult): ReportDocument {
  return {
    slug: 'ageing',
    title: 'Outstanding Ageing',
    subtitle: 'Unpaid bill balances by how long they have been owed.',
    summary: [
      { label: '0–30 days', value: rupees(result.buckets.bucket0to30) },
      { label: '31–60 days', value: rupees(result.buckets.bucket31to60) },
      { label: '60+ days', value: rupees(result.buckets.bucket60Plus) },
      { label: 'Total aged', value: rupees(result.buckets.total) },
    ],
    sections: [
      {
        columns: [
          { key: 'name', header: 'Customer', width: 170 },
          { key: 'phone', header: 'Phone', width: 110 },
          { key: 'bucket0to30', header: '0–30 days', width: 110, format: 'money' },
          { key: 'bucket31to60', header: '31–60 days', width: 110, format: 'money' },
          { key: 'bucket60Plus', header: '60+ days', width: 110, format: 'money' },
          { key: 'billDue', header: 'Total due', width: 110, format: 'money' },
          { key: 'oldestBillDays', header: 'Oldest (days)', width: 90, format: 'int' },
        ],
        rows: result.customers as unknown as Record<string, string | number>[],
        totals: {
          name: 'Total',
          bucket0to30: result.buckets.bucket0to30,
          bucket31to60: result.buckets.bucket31to60,
          bucket60Plus: result.buckets.bucket60Plus,
          billDue: result.buckets.total,
        },
        emptyText: 'Nothing is outstanding against a bill.',
      },
    ],
    notes: [
      'Ageing is counted in days from the bill date, on the shop clock.',
      result.unbucketed !== 0
        ? `${rupees(Math.abs(result.unbucketed))} of the ${rupees(result.totalOutstanding)} total is an opening balance or adjustment not tied to a bill, so it cannot be aged and is not in the buckets above.`
        : '',
    ].filter(Boolean),
  };
}

export function productSalesDocument(result: ProductSalesResult): ReportDocument {
  return {
    slug: 'product-sales',
    title: 'Product Sales',
    range: result.range,
    summary: [
      { label: 'Products sold', value: String(result.totals.productCount) },
      { label: 'Sales value', value: rupees(result.totals.value) },
      { label: 'Discount given', value: rupees(result.totals.discountGiven) },
    ],
    sections: [
      {
        columns: [
          { key: 'name', header: 'Product', width: 180 },
          { key: 'sku', header: 'SKU', width: 100 },
          { key: 'categoryName', header: 'Category', width: 110 },
          { key: 'qty', header: 'Quantity', width: 85, format: 'qty' },
          { key: 'unit', header: 'Unit', width: 55 },
          { key: 'billCount', header: 'Bills', width: 55, format: 'int' },
          { key: 'averageRate', header: 'Avg rate', width: 90, format: 'money' },
          { key: 'discountGiven', header: 'Discount', width: 90, format: 'money' },
          { key: 'value', header: 'Sales value', width: 110, format: 'money' },
        ],
        rows: result.rows as unknown as Record<string, string | number>[],
        totals: { name: 'Total', discountGiven: result.totals.discountGiven, value: result.totals.value },
        emptyText: 'No sales in this period.',
      },
    ],
    notes: [
      'Sales value is net of every discount and excludes GST.',
      'Average rate is the sales value divided by the quantity sold.',
    ],
  };
}

export function categorySalesDocument(result: CategorySalesResult): ReportDocument {
  return {
    slug: 'category-sales',
    title: 'Category Sales',
    range: result.range,
    summary: [{ label: 'Total sales value', value: rupees(result.totalValue) }],
    sections: [
      {
        columns: [
          { key: 'name', header: 'Category', width: 180 },
          { key: 'code', header: 'Code', width: 90 },
          { key: 'productCount', header: 'Products sold', width: 100, format: 'int' },
          { key: 'qty', header: 'Quantity', width: 100, format: 'qty' },
          { key: 'value', header: 'Sales value', width: 130, format: 'money' },
          { key: 'sharePercent', header: 'Share', width: 90, format: 'percent' },
        ],
        rows: result.rows as unknown as Record<string, string | number>[],
        totals: { name: 'Total', value: result.totalValue, sharePercent: result.totalValue > 0 ? 100 : 0 },
        emptyText: 'No sales in this period.',
      },
    ],
    notes: ['Sales value is net of every discount and excludes GST.'],
  };
}

export function paymentCollectionDocument(result: PaymentCollectionResult): ReportDocument {
  return {
    slug: 'payment-collection',
    title: 'Payment Collection',
    range: result.range,
    summary: [
      { label: 'Collected on bills', value: rupees(result.billCollectionTotal) },
      { label: 'Khata receipts', value: rupees(result.receiptsTotal) },
      { label: 'Total collected', value: rupees(result.grandTotal) },
      { label: 'Given on credit', value: rupees(result.creditGiven) },
    ],
    sections: [
      {
        title: 'Collected at the counter, by payment mode',
        columns: [
          { key: 'mode', header: 'Mode', width: 160 },
          { key: 'count', header: 'Bills', width: 90, format: 'int' },
          { key: 'amount', header: 'Amount', width: 150, format: 'money' },
        ],
        rows: result.billCollection.map((row) => ({ ...row, mode: PAYMENT_LABEL[row.mode] ?? row.mode })),
        totals: { mode: 'Total', amount: result.billCollectionTotal },
        emptyText: 'Nothing was collected in this period.',
      },
      {
        title: 'Khata receipts against earlier bills',
        columns: [
          { key: 'mode', header: 'Mode', width: 160 },
          { key: 'count', header: 'Receipts', width: 90, format: 'int' },
          { key: 'amount', header: 'Amount', width: 150, format: 'money' },
        ],
        rows: result.receipts.map((row) => ({ ...row, mode: PAYMENT_LABEL[row.mode] ?? row.mode })),
        totals: { mode: 'Total', amount: result.receiptsTotal },
        emptyText: 'No standalone khata receipts. Recording them arrives with the payments module.',
      },
    ],
    notes: [
      'Collected at the counter is the amount paid on each bill at the time of sale.',
      'Given on credit is what was invoiced in this period but left unpaid.',
    ],
  };
}

export function profitMarginDocument(result: ProfitMarginResult): ReportDocument {
  const { overall } = result;
  return {
    slug: 'profit-margin',
    title: 'Profit & Margin',
    subtitle: 'Built on cost price. Shop owner only.',
    range: result.range,
    summary: [
      { label: 'Revenue (excl. GST)', value: rupees(overall.revenue) },
      { label: 'Cost of goods sold', value: rupees(overall.cost) },
      { label: 'Gross profit', value: rupees(overall.profit) },
      { label: 'Margin', value: `${overall.marginPercent.toFixed(2)}%` },
    ],
    sections: [
      {
        title: 'By product',
        columns: [
          { key: 'name', header: 'Product', width: 190 },
          { key: 'sku', header: 'SKU', width: 100 },
          { key: 'qty', header: 'Quantity', width: 85, format: 'qty' },
          { key: 'unit', header: 'Unit', width: 55 },
          { key: 'revenue', header: 'Revenue', width: 110, format: 'money' },
          { key: 'cost', header: 'Cost', width: 110, format: 'money' },
          { key: 'profit', header: 'Profit', width: 110, format: 'money' },
          { key: 'marginPercent', header: 'Margin', width: 85, format: 'percent' },
        ],
        rows: result.rows as unknown as Record<string, string | number>[],
        totals: {
          name: 'Total',
          revenue: overall.revenue,
          cost: overall.cost,
          profit: overall.profit,
          marginPercent: overall.marginPercent,
        },
        emptyText: 'No sales in this period.',
      },
      ...(result.lossMakers.length > 0
        ? [
            {
              title: 'Sold at or below cost',
              columns: [
                { key: 'name', header: 'Product', width: 190 },
                { key: 'sku', header: 'SKU', width: 100 },
                { key: 'qty', header: 'Quantity', width: 85, format: 'qty' as const },
                { key: 'revenue', header: 'Revenue', width: 110, format: 'money' as const },
                { key: 'cost', header: 'Cost', width: 110, format: 'money' as const },
                { key: 'profit', header: 'Loss', width: 110, format: 'money' as const },
              ],
              rows: result.lossMakers as unknown as Record<string, string | number>[],
            },
          ]
        : []),
    ],
    notes: [
      'Revenue excludes GST — tax collected is owed to the government, not shop income.',
      'Cost is the cost price recorded against each product at the moment of sale, so a later price change does not rewrite past margins.',
      `${overall.billCount} bill(s) in this period, with ${rupees(overall.discountGiven)} of discount given.`,
    ],
  };
}
