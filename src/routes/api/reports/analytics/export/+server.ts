/**
 * GET /api/reports/analytics/export
 *
 * Generates a styled XLSX report using ExcelJS.
 * Accepts the same query params as /api/reports/analytics.
 * Returns an application/vnd.openxmlformats-officedocument.spreadsheetml.sheet response.
 *
 * Query params:
 *   period  — "week" | "month" | "semester" (default: "month")
 *   from    — ISO date string override (optional)
 *   to      — ISO date string override (optional)
 */

import type { RequestHandler } from './$types';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ALLOWED_ROLES = new Set(['instructor', 'custodian', 'superadmin']);

// ─── Colour palette (CHTM pink brand) ────────────────────────────────────────
const PINK = 'FFEC4899';       // pink-500
const PINK_LIGHT = 'FFFCE7F3'; // pink-50
const GRAY_HEADER = 'FFF3F4F6'; // gray-100
const WHITE = 'FFFFFFFF';
const DARK = 'FF111827';       // gray-900
const BORDER_COLOR = 'FFE5E7EB'; // gray-200

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso?: string | null): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (isNaN(d.getTime())) return iso;
	return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function applyHeaderRow(row: ExcelJS.Row, bgColor = PINK): void {
	row.eachCell((cell) => {
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
		cell.font = { bold: true, color: { argb: bgColor === PINK ? WHITE : DARK }, size: 10 };
		cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
		cell.border = {
			bottom: { style: 'thin', color: { argb: BORDER_COLOR } }
		};
	});
	row.height = 22;
}

function applySectionTitle(row: ExcelJS.Row): void {
	row.eachCell((cell) => {
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PINK_LIGHT } };
		cell.font = { bold: true, color: { argb: PINK }, size: 11 };
		cell.alignment = { vertical: 'middle' };
	});
	row.height = 24;
}

function applyDataRow(row: ExcelJS.Row, isAlt: boolean): void {
	row.eachCell((cell) => {
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlt ? GRAY_HEADER : WHITE } };
		cell.font = { size: 10, color: { argb: DARK } };
		cell.alignment = { vertical: 'middle', wrapText: false };
		cell.border = {
			bottom: { style: 'hair', color: { argb: BORDER_COLOR } }
		};
	});
	row.height = 18;
}

function addSection(
	ws: ExcelJS.Worksheet,
	title: string,
	headers: string[],
	rows: (string | number | null | undefined)[][]
): void {
	// Section title
	const titleRow = ws.addRow([title]);
	applySectionTitle(titleRow);
	ws.addRow([]); // spacer

	// Column headers
	const headerRow = ws.addRow(headers);
	applyHeaderRow(headerRow);

	// Data rows
	rows.forEach((r, i) => {
		const dataRow = ws.addRow(r);
		applyDataRow(dataRow, i % 2 === 1);
	});

	ws.addRow([]); // trailing spacer
}

// ─── Period helper (mirrors the analytics endpoint) ───────────────────────────

function getPeriodRange(period: string, from?: string, to?: string): { start: Date; end: Date; label: string } {
	const end = to ? new Date(to) : new Date();
	end.setHours(23, 59, 59, 999);

	if (from) {
		const start = new Date(from);
		start.setHours(0, 0, 0, 0);
		const fromLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		const toLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		return { start, end, label: `${fromLabel} – ${toLabel}` };
	}

	const start = new Date(end);
	if (period === 'week') {
		start.setDate(start.getDate() - 7);
		start.setHours(0, 0, 0, 0);
		return { start, end, label: 'Last 7 Days' };
	} else if (period === 'semester') {
		start.setMonth(start.getMonth() - 6);
		start.setHours(0, 0, 0, 0);
		return { start, end, label: 'Last 6 Months' };
	} else {
		// month / mtd
		start.setDate(1);
		start.setHours(0, 0, 0, 0);
		return { start, end, label: 'Month-to-Date' };
	}
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export const GET: RequestHandler = async (event) => {
	const rl = await rateLimit(event, RateLimitPresets.API);
	if (rl instanceof Response) return rl;

	const user = getUserFromToken(event);
	if (!user) return new Response('Unauthorized', { status: 401 });
	if (!ALLOWED_ROLES.has(user.role)) return new Response('Forbidden', { status: 403 });

	try {
		const url = new URL(event.request.url);
		const period = url.searchParams.get('period') || 'month';
		const from = url.searchParams.get('from') || undefined;
		const to = url.searchParams.get('to') || undefined;
		const { label: rangeLabel } = getPeriodRange(period, from, to);

		// Fetch the full analytics payload from the existing endpoint
		const analyticsUrl = new URL('/api/reports/analytics', url.origin);
		analyticsUrl.searchParams.set('period', period);
		if (from) analyticsUrl.searchParams.set('from', from);
		if (to) analyticsUrl.searchParams.set('to', to);

		const analyticsRes = await fetch(analyticsUrl.toString(), {
			headers: { cookie: event.request.headers.get('cookie') ?? '' }
		});

		if (!analyticsRes.ok) {
			return new Response('Failed to fetch analytics data', { status: 502 });
		}

		const report = await analyticsRes.json();

		// ── Build workbook ────────────────────────────────────────────────────
		const wb = new ExcelJS.Workbook();
		wb.creator = 'CHTM Cooks System';
		wb.created = new Date();

		const ws = wb.addWorksheet('Reports & Analytics', {
			pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
			properties: { defaultRowHeight: 18 }
		});

		// Set column widths (A–H)
		ws.columns = [
			{ width: 32 }, // A
			{ width: 22 }, // B
			{ width: 18 }, // C
			{ width: 18 }, // D
			{ width: 18 }, // E
			{ width: 18 }, // F
			{ width: 18 }, // G
			{ width: 18 }, // H
		];

		// ── Logo + Title header block ─────────────────────────────────────────
		try {
			const logoPath = resolve('src/lib/assets/CHTM_LOGO.png');
			const logoBuffer = readFileSync(logoPath);
			const logoId = wb.addImage({ buffer: logoBuffer, extension: 'png' });
			ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 60, height: 60 } });
		} catch {
			// Logo not found — skip silently
		}

		// Rows 1-4: header block
		ws.addRow([]); // row 1 — logo space
		ws.addRow([]); // row 2
		const titleRow = ws.addRow(['CHTM COOKS - REPORTS & ANALYTICS']); // row 3
		titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: PINK } };
		titleRow.getCell(1).alignment = { vertical: 'middle' };
		titleRow.height = 28;

		const subRow = ws.addRow([`Date Range: ${rangeLabel}   |   Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`]); // row 4
		subRow.getCell(1).font = { size: 10, color: { argb: 'FF6B7280' } };
		subRow.height = 18;

		ws.addRow([]); // spacer

		// ── TAB 1: Overview ───────────────────────────────────────────────────
		const br = report.borrowRequests ?? {};
		const avg = br.borrowingAverages ?? {};

		addSection(ws, 'OVERVIEW - BORROW REQUESTS', ['Metric', 'Value'], [
			['Total Requests', avg.totalRequests ?? 0],
			['Overdue Count', br.overdueCount ?? 0],
			['Avg Items per Request', avg.avgItemsPerRequest ?? 0],
			['Avg Quantity per Request', avg.avgQuantityPerRequest ?? 0],
			['Avg Approval Hours', br.turnaround?.avgApprovalHours ?? 0],
			['Avg Release Hours', br.turnaround?.avgReleaseHours ?? 0],
			['Avg Return Hours', br.turnaround?.avgReturnHours ?? 0],
		]);

		if ((br.statusBreakdown ?? []).length) {
			addSection(ws, 'STATUS BREAKDOWN', ['Status', 'Count'],
				br.statusBreakdown.map((s: { status: string; count: number }) => [s.status, s.count])
			);
		}

		if ((br.itemsBorrowed ?? []).length) {
			addSection(ws, 'TOP BORROWED ITEMS', ['Item', 'Category', 'Times Borrowed', 'Total Quantity'],
				br.itemsBorrowed.map((i: { name: string; category: string; borrowCount: number; totalQuantity: number }) => [i.name, i.category, i.borrowCount, i.totalQuantity])
			);
		}

		if ((br.overdueRequests ?? []).length) {
			addSection(ws, 'OVERDUE REQUESTS', ['Student', 'Return Date', 'Days Overdue', 'Item Count'],
				br.overdueRequests.map((r: { studentName: string; returnDate: string; daysOverdue: number; itemCount: number }) => [r.studentName, fmtDate(r.returnDate), r.daysOverdue, r.itemCount])
			);
		}

		// ── TAB 2: Borrowing Analytics ────────────────────────────────────────
		if ((br.requestsOverTime ?? []).length) {
			addSection(ws, 'REQUESTS OVER TIME', ['Date', 'Count'],
				br.requestsOverTime.map((p: { date: string; count: number }) => [fmtDate(p.date), p.count])
			);
		}

		if ((br.itemEntries ?? []).length) {
			addSection(ws, 'BORROWED ITEM ENTRIES', ['Item', 'Category', 'Qty', 'Student', 'Email', 'Request Date', 'Status'],
				br.itemEntries.map((e: { name: string; category: string; quantity: number; studentName: string; studentEmail: string; requestDate: string; requestStatus: string }) =>
					[e.name, e.category, e.quantity, e.studentName, e.studentEmail, fmtDate(e.requestDate), e.requestStatus])
			);
		}

		if ((br.borrowers ?? []).length) {
			addSection(ws, 'BORROWERS', ['Student', 'Email', 'Request Count', 'Total Items'],
				br.borrowers.map((b: { studentName: string; studentEmail: string; requestCount: number; totalItems: number }) => [b.studentName, b.studentEmail, b.requestCount, b.totalItems])
			);
		}

		// ── TAB 3: Loss & Damage ──────────────────────────────────────────────
		const ld = report.lossAndDamage ?? {};
		const lds = ld.summary ?? {};

		addSection(ws, 'LOSS & DAMAGE SUMMARY', ['Period', 'Missing', 'Damaged', 'Total'], [
			['Today', lds.todayMissing ?? 0, lds.todayDamaged ?? 0, lds.todayTotal ?? 0],
			['Last 7 Days', lds.last7DaysMissing ?? 0, lds.last7DaysDamaged ?? 0, lds.last7DaysTotal ?? 0],
			['Month-to-Date', lds.mtdMissing ?? 0, lds.mtdDamaged ?? 0, lds.mtdTotal ?? 0],
			['Selected Period', lds.periodMissing ?? 0, lds.periodDamaged ?? 0, lds.periodTotal ?? 0],
		]);

		if ((ld.tracking ?? []).length) {
			addSection(ws, 'LOSS & DAMAGE TRACKING',
				['Type', 'Item', 'Category', 'Student', 'Status', 'Amount', 'Amount Paid', 'Incident Date', 'Resolution Date', 'Days to Resolve'],
				ld.tracking.map((t: { type: string; itemName: string; itemCategory: string; studentName: string; status: string; amount: number; amountPaid: number; incidentDate: string; resolutionDate?: string; daysToResolve?: number }) =>
					[t.type, t.itemName, t.itemCategory, t.studentName, t.status, t.amount, t.amountPaid, fmtDate(t.incidentDate), fmtDate(t.resolutionDate), t.daysToResolve ?? ''])
			);
		}

		const rep = report.replacement ?? {};
		const reps = rep.summary ?? {};
		addSection(ws, 'REPLACEMENT SUMMARY', ['Metric', 'Value'], [
			['Total Obligations', reps.totalObligations ?? 0],
			['Pending Count', reps.pendingCount ?? 0],
			['Items Pending Replacement', reps.totalItemsPending ?? 0],
			['Items Replaced', reps.totalItemsReplaced ?? 0],
		]);

		if ((rep.obligationsByCategory ?? []).length) {
			addSection(ws, 'OBLIGATIONS BY CATEGORY', ['Category', 'Count', 'Total Amount', 'Pending Amount'],
				rep.obligationsByCategory.map((c: { category: string; count: number; totalAmount: number; pendingAmount: number }) => [c.category, c.count, c.totalAmount, c.pendingAmount])
			);
		}

		// ── TAB 4: Inventory ──────────────────────────────────────────────────
		const inv = report.inventory ?? {};
		const invs = inv.summary ?? {};

		addSection(ws, 'INVENTORY SUMMARY', ['Metric', 'Value'], [
			['Current Count', invs.currentCount ?? 0],
			['EOM Count', invs.eomCount ?? 0],
			['Variance', invs.variance ?? 0],
			['Donations', invs.donations ?? 0],
			['Constant Items', invs.constantCount ?? 0],
			['Low Stock Count', invs.lowStockCount ?? 0],
		]);

		if ((inv.mostBorrowedItems ?? []).length) {
			addSection(ws, 'MOST BORROWED ITEMS', ['Item', 'Category', 'Total Borrows', 'Total Quantity'],
				inv.mostBorrowedItems.map((i: { name: string; category: string; totalBorrows: number; totalQuantity: number }) => [i.name, i.category, i.totalBorrows, i.totalQuantity])
			);
		}

		if ((inv.itemsCurrentlyOut ?? []).length) {
			addSection(ws, 'ITEMS CURRENTLY OUT', ['Item', 'Category', 'Qty Out', 'Total Stock'],
				inv.itemsCurrentlyOut.map((i: { name: string; category: string; quantityOut: number; totalStock: number }) => [i.name, i.category, i.quantityOut, i.totalStock])
			);
		}

		if ((inv.eomVariance ?? []).length) {
			addSection(ws, 'EOM VARIANCE', ['Item', 'Category', 'Current Qty', 'EOM Count', 'Variance'],
				inv.eomVariance.map((i: { name: string; category: string; quantity: number; eomCount: number; variance: number }) => [i.name, i.category, i.quantity, i.eomCount, i.variance])
			);
		}

		if ((inv.damageRateItems ?? []).length) {
			addSection(ws, 'DAMAGE RATE BY ITEM', ['Item', 'Category', 'Total Inspected', 'Damaged', 'Missing', 'Incident Rate %'],
				inv.damageRateItems.map((i: { name: string; category: string; totalInspected: number; damaged: number; missing: number; incidentRate: number }) =>
					[i.name, i.category, i.totalInspected, i.damaged, i.missing, i.incidentRate])
			);
		}

		if ((inv.stockAlerts ?? []).length) {
			addSection(ws, 'STOCK ALERTS', ['Item', 'Category', 'Quantity', 'Status'],
				inv.stockAlerts.map((a: { name: string; category: string; quantity: number; status: string }) => [a.name, a.category, a.quantity, a.status])
			);
		}

		if ((inv.constantItems ?? []).length) {
			addSection(ws, 'CONSTANT ITEMS', ['Item', 'Category', 'Quantity', 'EOM Count', 'Variance', 'Donations', 'Status'],
				inv.constantItems.map((i: { name: string; category: string; quantity: number; eomCount: number; variance: number; donations: number; status: string }) =>
					[i.name, i.category, i.quantity, i.eomCount, i.variance, i.donations, i.status])
			);
		}

		// ── TAB 5: Student Risk ───────────────────────────────────────────────
		const sr = report.studentRisk ?? {};

		if ((sr.trustScores ?? []).length) {
			addSection(ws, 'STUDENT TRUST SCORES',
				['Student', 'Email', 'Trust Score', 'Tier', 'Requests Total', 'Returned', 'Active Obligations', 'Incidents'],
				sr.trustScores.map((s: { studentName: string; studentEmail: string; trustScore?: number; trustTierLabel?: string; trustTier?: string; requestsTotal?: number; requestsReturned?: number; activeObligations?: number; incidents?: number }) =>
					[s.studentName, s.studentEmail, s.trustScore ?? '', s.trustTierLabel ?? s.trustTier ?? '', s.requestsTotal ?? '', s.requestsReturned ?? '', s.activeObligations ?? '', s.incidents ?? ''])
			);
		}

		if ((sr.overdueStudents ?? []).length) {
			addSection(ws, 'OVERDUE STUDENTS', ['Student', 'Email', 'Overdue Count', 'Days Overdue', 'Total Items'],
				sr.overdueStudents.map((s: { studentName: string; studentEmail: string; overdueCount?: number; daysOverdue?: number; totalItems?: number }) =>
					[s.studentName, s.studentEmail, s.overdueCount ?? '', s.daysOverdue ?? '', s.totalItems ?? ''])
			);
		}

		if ((sr.repeatOffenders ?? []).length) {
			addSection(ws, 'REPEAT OFFENDERS', ['Student', 'Email', 'Incidents', 'Missing', 'Damaged'],
				sr.repeatOffenders.map((s: { studentName: string; studentEmail: string; incidents?: number; missingCount?: number; damagedCount?: number }) =>
					[s.studentName, s.studentEmail, s.incidents ?? '', s.missingCount ?? '', s.damagedCount ?? ''])
			);
		}

		// ── Freeze top rows and auto-filter ──────────────────────────────────
		ws.views = [{ state: 'frozen', ySplit: 5 }];

		// ── Serialize and return ──────────────────────────────────────────────
		const buffer = await wb.xlsx.writeBuffer();
		const safeRange = rangeLabel.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
		const filename = `chtm-cooks-analytics-${safeRange}-${new Date().toISOString().slice(0, 10)}.xlsx`;

		return new Response(buffer as ArrayBuffer, {
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="${filename}"`,
				'Cache-Control': 'no-store'
			}
		});
	} catch (err) {
		logger.error('GET /api/reports/analytics/export error', { err });
		return new Response('Failed to generate export', { status: 500 });
	}
};
