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
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ALLOWED_ROLES = new Set(['instructor', 'custodian', 'superadmin']);

// ─── Colour palette (CHTM brand + professional report styling) ───────────────
const PINK_HEADER = 'FFBE185D'; // table header (pink-700)
const PINK_SECTION = 'FFEC4899'; // section title accent (pink-500)
const PINK_LIGHT = 'FFFDF2F8'; // pink-50 section band
const ROW_ALT = 'FFF9FAFB'; // gray-50 zebra
const WHITE = 'FFFFFFFF';
const DARK = 'FF111827'; // gray-900
const MUTED = 'FF6B7280'; // gray-500
const BORDER_COLOR = 'FFE5E7EB'; // gray-200
const FONT = 'Calibri';
const SHEET_COL_COUNT = 8; // A through H
const COL_WIDTH = 30; // uniform minimum column width (Excel character units)

/** Parse section filter from query (supports repeated ?sections= keys or legacy comma list) */
function parseEnabledSections(url: URL): Set<string> | null {
	const repeated = url.searchParams
		.getAll('sections')
		.flatMap((v) => v.split(/[,|]/))
		.map((s) => s.trim())
		.filter(Boolean);
	if (repeated.length > 0) return new Set(repeated);
	return null;
}

function shouldExportSection(enabledSections: Set<string> | null, id: string): boolean {
	if (!enabledSections) return true;
	return enabledSections.has(id);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso?: string | null): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (isNaN(d.getTime())) return iso;
	return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const thinBorder = {
	top: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
	left: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
	bottom: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
	right: { style: 'thin' as const, color: { argb: BORDER_COLOR } }
};

function clearSheetCell(cell: ExcelJS.Cell): void {
	cell.value = null;
	cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
	cell.border = {};
}

function estimateRowHeight(row: ExcelJS.Row, cols: number[], min = 22): number {
	let maxLines = 1;
	for (const col of cols) {
		const cell = row.getCell(col);
		const text = cell.value == null ? '' : String(cell.value);
		const width = row.worksheet.getColumn(col).width ?? COL_WIDTH;
		const charsPerLine = Math.max(10, Math.floor(width * 1.15));
		maxLines = Math.max(maxLines, Math.ceil(text.length / charsPerLine) || 1);
	}
	return Math.min(48, Math.max(min, maxLines * 15));
}

/** Paired KPI grid: A–C left block | D gutter | E–G right block | H gutter */
const PAIRED_KPI_COLS = [1, 2, 3, 5, 6, 7] as const;
const PAIRED_GUTTER_COLS = [4, 8] as const;

function setUniformColumnWidths(sheet: ExcelJS.Worksheet): void {
	for (let c = 1; c <= SHEET_COL_COUNT; c++) {
		const col = sheet.getColumn(c);
		col.width = COL_WIDTH;
		col.hidden = false;
	}
	if (sheet.properties) {
		sheet.properties.defaultColWidth = COL_WIDTH;
	}
}

const LOGO_SCALE = 0.78; // fraction of max cell bounds (keeps COL_WIDTH fixed)

/** Max logo width (px) that fits inside a fixed COL_WIDTH column without expanding it */
function logoWidthPx(): number {
	return Math.round((COL_WIDTH * 6.5 - 12) * LOGO_SCALE);
}

/** Logo height from header row band (px) — grows logos vertically, not horizontally */
function logoHeightPx(firstRow: number, lastRow: number, rowHeightPt: number): number {
	const rowCount = lastRow - firstRow + 1;
	return Math.round(rowCount * rowHeightPt * (96 / 72) * 0.88 * LOGO_SCALE);
}

function applyGutterCell(cell: ExcelJS.Cell): void {
	cell.value = null;
	cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
	cell.border = {
		left: { style: 'thin', color: { argb: BORDER_COLOR } },
		right: { style: 'thin', color: { argb: BORDER_COLOR } }
	};
}

function applyHeaderRow(row: ExcelJS.Row, activeCols: number[], gutterCols: number[] = []): void {
	const gutterSet = new Set(gutterCols);
	for (let col = 1; col <= SHEET_COL_COUNT; col++) {
		const cell = row.getCell(col);
		if (gutterSet.has(col)) {
			applyGutterCell(cell);
			continue;
		}
		if (!activeCols.includes(col)) {
			clearSheetCell(cell);
			continue;
		}
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PINK_HEADER } };
		cell.font = { name: FONT, bold: true, color: { argb: WHITE }, size: 11 };
		cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
		cell.border = thinBorder;
	}
	row.height = 24;
}

function applySectionTitle(row: ExcelJS.Row): void {
	const cell = row.getCell(1);
	cell.value = row.getCell(1).value;
	cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PINK_LIGHT } };
	cell.font = { name: FONT, bold: true, color: { argb: PINK_SECTION }, size: 11 };
	cell.alignment = { vertical: 'middle', horizontal: 'left' };
	cell.border = {
		top: { style: 'medium', color: { argb: PINK_HEADER } },
		bottom: { style: 'thin', color: { argb: BORDER_COLOR } }
	};
	row.worksheet.mergeCells(row.number, 1, row.number, SHEET_COL_COUNT);
	for (let col = 2; col <= SHEET_COL_COUNT; col++) {
		const c = row.getCell(col);
		c.fill = cell.fill;
		c.border = cell.border;
	}
	row.height = 24;
}

type ColumnFormat = 'text' | 'integer' | 'percent' | 'decimal';

function applyDataRow(
	row: ExcelJS.Row,
	isAlt: boolean,
	columnFormats: ColumnFormat[],
	activeCols: number[],
	gutterCols: number[] = []
): void {
	const gutterSet = new Set(gutterCols);
	const formatByCol = new Map<number, ColumnFormat>();
	activeCols.forEach((col, i) => formatByCol.set(col, columnFormats[i] ?? 'text'));

	for (let col = 1; col <= SHEET_COL_COUNT; col++) {
		const cell = row.getCell(col);
		if (gutterSet.has(col)) {
			applyGutterCell(cell);
			continue;
		}
		if (!activeCols.includes(col)) {
			clearSheetCell(cell);
			continue;
		}

		const fmt = formatByCol.get(col) ?? 'text';
		cell.fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: isAlt ? ROW_ALT : WHITE }
		};
		cell.font = { name: FONT, size: 11, color: { argb: DARK } };
		cell.border = thinBorder;

		if (fmt === 'integer' || fmt === 'decimal' || fmt === 'percent') {
			cell.alignment = { vertical: 'middle', horizontal: 'right' };
			if (typeof cell.value === 'string' && cell.value !== '') {
				const parsed = Number(cell.value.replace(/[%,+]/g, ''));
				if (!Number.isNaN(parsed)) cell.value = parsed;
			}
			if (fmt === 'integer') cell.numFmt = '#,##0';
			else if (fmt === 'decimal') cell.numFmt = '#,##0.00';
			else if (fmt === 'percent') cell.numFmt = '0%';
		} else {
			cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
		}
	}
	row.height = estimateRowHeight(row, activeCols);
}

function addSection(
	ws: ExcelJS.Worksheet,
	title: string,
	headers: string[],
	rows: (string | number | null | undefined)[][],
	columnFormats?: ColumnFormat[],
	rowFormats?: ColumnFormat[][]
): void {
	const activeCols = headers.map((_, i) => i + 1);
	const defaultFormats: ColumnFormat[] =
		columnFormats ?? headers.map(() => 'text' as ColumnFormat);

	const titleRow = ws.addRow([title]);
	applySectionTitle(titleRow);

	const headerValues = headers.map((v) => (v === null || v === undefined ? '' : v));
	const headerRow = ws.addRow(headerValues);
	applyHeaderRow(headerRow, activeCols);

	rows.forEach((r, i) => {
		const rowValues = r.map((v) => (v === null || v === undefined ? '' : v));
		const dataRow = ws.addRow(rowValues);
		const formats = rowFormats?.[i] ?? defaultFormats;
		applyDataRow(dataRow, i % 2 === 1, formats, activeCols);
	});

	ws.addRow([]);
}

type MetricEntry = {
	cells: [string, string | number, string];
	formats: [ColumnFormat, ColumnFormat, ColumnFormat];
};

/** KPI block: two metrics per row — A–C | gutter D | E–G | gutter H */
function addPairedMetricsSection(ws: ExcelJS.Worksheet, title: string, metrics: MetricEntry[]): void {
	const pairHeaders: (string | number)[] = ['', '', '', '', '', '', '', ''];
	pairHeaders[0] = 'Metric';
	pairHeaders[1] = 'Value';
	pairHeaders[2] = 'Context / Details';
	pairHeaders[4] = 'Metric';
	pairHeaders[5] = 'Value';
	pairHeaders[6] = 'Context / Details';

	const titleRow = ws.addRow([title]);
	applySectionTitle(titleRow);

	const headerRow = ws.addRow(pairHeaders);
	applyHeaderRow(headerRow, [...PAIRED_KPI_COLS], [...PAIRED_GUTTER_COLS]);

	for (let i = 0; i < metrics.length; i += 2) {
		const left = metrics[i];
		const right = metrics[i + 1];
		const rowValues: (string | number)[] = ['', '', '', '', '', '', '', ''];
		const formats: ColumnFormat[] = [];

		rowValues[0] = left.cells[0];
		rowValues[1] = left.cells[1];
		rowValues[2] = left.cells[2];
		formats.push(...left.formats);

		if (right) {
			rowValues[4] = right.cells[0];
			rowValues[5] = right.cells[1];
			rowValues[6] = right.cells[2];
			formats.push(...right.formats);
		} else {
			formats.push('text', 'text', 'text');
		}

		const dataRow = ws.addRow(rowValues);
		applyDataRow(
			dataRow,
			(i / 2) % 2 === 1,
			formats,
			right ? [...PAIRED_KPI_COLS] : [1, 2, 3],
			[...PAIRED_GUTTER_COLS]
		);
	}

	ws.addRow([]);
}

// ─── Period helper (mirrors the analytics endpoint) ───────────────────────────

function getPeriodRange(
	period: string,
	from?: string,
	to?: string
): { start: Date; end: Date; label: string } {
	const end = to ? new Date(to) : new Date();
	end.setHours(23, 59, 59, 999);

	if (from) {
		const start = new Date(from);
		start.setHours(0, 0, 0, 0);
		const fromLabel = start.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
		const toLabel = end.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
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

	// Fetch user details for Counted by
	let userName = '';
	try {
		const db = await getDatabase();
		const dbUser = await db.collection('users').findOne({ _id: new ObjectId(user.userId) });
		if (dbUser) {
			userName = `${dbUser.firstName} ${dbUser.lastName}`.toUpperCase();
		} else {
			userName = user.email.split('@')[0].replace(/\./g, ' ').toUpperCase();
		}
	} catch (err) {
		userName = user.email.split('@')[0].replace(/\./g, ' ').toUpperCase();
	}

	try {
		const url = new URL(event.request.url);
		let period = url.searchParams.get('period') || 'month';
		if (!['week', 'month', 'semester'].includes(period)) {
			period = 'month';
		}
		const from = url.searchParams.get('from') || undefined;
		const to = url.searchParams.get('to') || undefined;
		const enabledSections = parseEnabledSections(url);
		const { label: rangeLabel, end: endPeriodDate } = getPeriodRange(period, from, to);

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

		const loadSheetImage = (relativePath: string): number | null => {
			try {
				const buffer = readFileSync(resolve(relativePath));
				return wb.addImage({ buffer: buffer as never, extension: 'png' });
			} catch {
				return null;
			}
		};

		const gcLogoId = loadSheetImage('src/lib/assets/GC_LOGO.png');
		const chtmSealId = loadSheetImage('src/lib/assets/CHTM.png');
		const chtmCooksLogoId = loadSheetImage('src/lib/assets/CHTM_LOGO.png');

		// Helper to create a formatted worksheet for a section
		const createTabSheet = (sheetName: string) => {
			const sheet = wb.addWorksheet(sheetName, {
				pageSetup: { paperSize: 9, orientation: 'portrait' },
				properties: { defaultRowHeight: 22, defaultColWidth: COL_WIDTH }
			});

			// Layout: logos A–C (merged rows) | title D–F | meta G–H
			const HEADER_FIRST_ROW = 2;
			const HEADER_LAST_ROW = 5;
			const HEADER_ROW_HEIGHT = 38;

			setUniformColumnWidths(sheet);

			sheet.getRow(1).height = 6;
			for (let r = HEADER_FIRST_ROW; r <= HEADER_LAST_ROW; r++) {
				sheet.getRow(r).height = HEADER_ROW_HEIGHT;
			}

			// One merged cell per logo column — image anchors inside, column width stays fixed
			for (let c = 1; c <= 3; c++) {
				const colLetter = String.fromCharCode(64 + c);
				sheet.mergeCells(`${colLetter}${HEADER_FIRST_ROW}:${colLetter}${HEADER_LAST_ROW}`);
				const cell = sheet.getCell(`${colLetter}${HEADER_FIRST_ROW}`);
				cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
				cell.alignment = { vertical: 'middle', horizontal: 'center' };
			}

			const titleCell = sheet.getCell('D2');
			titleCell.value = {
				richText: [
					{
						text: 'COLLEGE OF HOSPITALITY AND TOURISM MANAGEMENT\n',
						font: { name: FONT, bold: true, size: 13, color: { argb: DARK } }
					},
					{
						text: 'GORDON COLLEGE\n',
						font: { name: FONT, bold: true, size: 12, color: { argb: DARK } }
					},
					{
						text: 'OLONGAPO CITY',
						font: { name: FONT, size: 11, color: { argb: MUTED } }
					}
				]
			};
			titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
			sheet.mergeCells(`D${HEADER_FIRST_ROW}:F${HEADER_LAST_ROW}`);

			const metaBorder = {
				top: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
				left: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
				bottom: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
				right: { style: 'thin' as const, color: { argb: BORDER_COLOR } }
			};

			const applyBoxCell = (
				cellRef: string,
				value: string,
				opts: { bold?: boolean; label?: boolean } = {}
			) => {
				const cell = sheet.getCell(cellRef);
				cell.value = value;
				cell.font = {
					name: FONT,
					bold: opts.bold ?? opts.label ?? false,
					size: 10,
					color: { argb: opts.label ? PINK_SECTION : DARK }
				};
				cell.fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: opts.label ? PINK_LIGHT : WHITE }
				};
				cell.alignment = { horizontal: opts.label ? 'left' : 'center', vertical: 'middle' };
				cell.border = metaBorder;
			};

			applyBoxCell('G2', 'Date of Inventory', { label: true, bold: true });
			const exportDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
			applyBoxCell('H2', exportDate);

			applyBoxCell('G3', 'Date Range', { label: true, bold: true });
			applyBoxCell('H3', rangeLabel);

			applyBoxCell('G4', 'Counted by:', { label: true, bold: true });
			applyBoxCell('H4', userName);

			applyBoxCell('G5', 'Verified by:', { label: true, bold: true });
			applyBoxCell('H5', '');

			// Floating images sized to fit fixed columns (ext), not tied to cell resize
			const logoW = logoWidthPx();
			const logoH = logoHeightPx(HEADER_FIRST_ROW, HEADER_LAST_ROW, HEADER_ROW_HEIGHT);
			const placeLogo = (imageId: number | null, colIndex: number) => {
				if (imageId === null) return;
				const colPx = COL_WIDTH * 7 + 5;
				const rowPx = (HEADER_LAST_ROW - HEADER_FIRST_ROW + 1) * HEADER_ROW_HEIGHT * (96 / 72);
				const xInset = Math.max(0.1, (colPx - logoW) / 2 / colPx);
				const yInset = Math.max(0.12, (rowPx - logoH) / 2 / rowPx);
				sheet.addImage(imageId, {
					tl: { col: colIndex + xInset, row: HEADER_FIRST_ROW - 1 + yInset },
					ext: { width: logoW, height: logoH }
				});
			};
			placeLogo(gcLogoId, 0);
			placeLogo(chtmSealId, 1);
			placeLogo(chtmCooksLogoId, 2);

			// Re-apply after images so opening in Excel does not auto-expand columns
			setUniformColumnWidths(sheet);

			sheet.views = [{ showGridLines: false }];

			return sheet;
		};

		// ── TAB 1: Overview ───────────────────────────────────────────────────
		if (shouldExportSection(enabledSections, 'overview')) {
			const ws = createTabSheet('Overview');
			const br = report.borrowRequests ?? {};
			const avg = br.borrowingAverages ?? {};

			const totalRequestsVal =
				br.statusBreakdown?.reduce((s: number, i: { count: number }) => s + i.count, 0) ?? 0;
			const returnedCountVal =
				br.statusBreakdown?.find((s: { status: string }) => s.status === 'returned')?.count ?? 0;
			const returnRateVal =
				totalRequestsVal > 0 ? Math.round((returnedCountVal / totalRequestsVal) * 100) : 0;

			const ld = report.lossAndDamage?.summary ?? {};
			const inv = report.inventory?.summary ?? {};
			const varianceRows = (report.inventory?.eomVariance ?? []).filter(
				(item: { variance: number }) => item.variance !== 0
			);
			const inventoryOverTotalVal = varianceRows.reduce(
				(sum: number, item: { variance: number }) =>
					item.variance > 0 ? sum + item.variance : sum,
				0
			);
			const inventoryShortTotalVal = varianceRows.reduce(
				(sum: number, item: { variance: number }) =>
					item.variance < 0 ? sum + item.variance : sum,
				0
			);

			const studentTrustScoresList = (report.studentRisk?.trustScores ?? []).filter(
				(student: { trustScore?: number }) => typeof student.trustScore === 'number'
			);
			const trustTiersCounts = {
				excellent: 0,
				good: 0,
				fair: 0,
				poor: 0,
				critical: 0
			};
			for (const s of studentTrustScoresList) {
				const tierKey = (s.trustTier ?? '').toLowerCase();
				if (tierKey in trustTiersCounts) {
					trustTiersCounts[tierKey as keyof typeof trustTiersCounts]++;
				}
			}

			// 1. Overview Cards Summary (two KPIs per row)
			addPairedMetricsSection(ws, 'OVERVIEW SUMMARY METRICS', [
				{
					cells: ['Total Requests', totalRequestsVal, 'Period total'],
					formats: ['text', 'integer', 'text']
				},
				{
					cells: ['Return Rate', returnRateVal / 100, 'Target: 90%'],
					formats: ['text', 'percent', 'text']
				},
				{
					cells: ['Overdue Items', br.overdueCount ?? 0, 'Requires attention'],
					formats: ['text', 'integer', 'text']
				},
				{
					cells: [
						'Loss/Damage (MTD) - Total',
						ld.mtdTotal ?? 0,
						`${ld.mtdMissing ?? 0} missing, ${ld.mtdDamaged ?? 0} damaged`
					],
					formats: ['text', 'integer', 'text']
				}
			]);

			// 2. Borrowing Status Mix (donut chart in UI)
			if ((br.statusBreakdown ?? []).length) {
				const totalStatusCount =
					br.statusBreakdown.reduce((sum: number, s: any) => sum + s.count, 0) || 1;
				addSection(
					ws,
					'BORROWING STATUS MIX',
					['Status', 'Count', 'Percentage'],
					br.statusBreakdown.map((s: { status: string; count: number }) => [
						s.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
						s.count,
						s.count / totalStatusCount
					]),
					['text', 'integer', 'percent']
				);
			}

			// 3. Top Borrowed Items (bar chart in UI)
			if ((br.itemsBorrowed ?? []).length) {
				addSection(
					ws,
					'TOP BORROWED ITEMS',
					['Item', 'Quantity'],
					br.itemsBorrowed
						.slice(0, 6)
						.map((i: { name: string; totalQuantity: number }) => [i.name, i.totalQuantity]),
					['text', 'integer']
				);
			}

			// 4. Loss vs Damage (donut chart in UI)
			addSection(
				ws,
				'LOSS VS DAMAGE (Selected range)',
				['Metric', 'Incidents Count'],
				[
					['Missing', ld.periodMissing ?? 0],
					['Damaged', ld.periodDamaged ?? 0],
					['Total Incidents', (ld.periodMissing ?? 0) + (ld.periodDamaged ?? 0)]
				],
				['text', 'integer']
			);

			// 5. Inventory Compare
			addSection(
				ws,
				'INVENTORY COMPARE',
				['Metric', 'Count'],
				[
					['Current', inv.currentCount ?? 0],
					['EOM', inv.eomCount ?? 0],
					['Over (+)', inventoryOverTotalVal],
					['Variance (-)', Math.abs(inventoryShortTotalVal)]
				],
				['text', 'integer']
			);

			// 6. Student Trust Tiers
			addSection(
				ws,
				'STUDENT TRUST TIERS',
				['Tier', 'Count'],
				[
					['Excellent', trustTiersCounts.excellent],
					['Good', trustTiersCounts.good],
					['Fair', trustTiersCounts.fair],
					['Poor', trustTiersCounts.poor],
					['Critical', trustTiersCounts.critical]
				],
				['text', 'integer']
			);
		}

		// ── TAB 2: Borrowing Analytics ────────────────────────────────────────
		if (shouldExportSection(enabledSections, 'borrowing')) {
			const ws = createTabSheet('Borrowing Analytics');
			const br = report.borrowRequests ?? {};
			const avg = br.borrowingAverages ?? {};

			addSection(
				ws,
				'BORROWING ANALYTICS SUMMARY',
				['Metric', 'Value'],
				[
					['Total Requests', avg.totalRequests ?? 0],
					['Avg Items / Request', avg.avgItemsPerRequest ?? 0],
					['Avg Quantity / Request', avg.avgQuantityPerRequest ?? 0]
				],
				['text', 'decimal'],
				[
					['text', 'integer'],
					['text', 'decimal'],
					['text', 'decimal']
				]
			);

			if ((br.itemEntries ?? []).length) {
				addSection(
					ws,
					'BORROWED ITEMS',
					['Item', 'Category / Location', 'Borrower Name', 'Qty', 'Request ID'],
					br.itemEntries.map(
						(e: {
							name: string;
							category: string;
							quantity: number;
							studentName: string;
							requestId: string;
						}) => [
							e.name,
							e.category,
							e.studentName || 'Unknown Student',
							e.quantity,
							`#${e.requestId.slice(-6).toUpperCase()}`
						]
					),
					['text', 'text', 'text', 'integer', 'text']
				);
			}

			if ((br.borrowers ?? []).length) {
				addSection(
					ws,
					'BORROWERS',
					['Student Name', 'Student Email', 'Request Count', 'Total Items'],
					br.borrowers.map(
						(b: {
							studentName: string;
							studentEmail: string;
							requestCount: number;
							totalItems: number;
						}) => [b.studentName, b.studentEmail, b.requestCount, b.totalItems]
					),
					['text', 'text', 'integer', 'integer']
				);
			}
		}

		// ── TAB 3: Loss & Damage ──────────────────────────────────────────────
		if (shouldExportSection(enabledSections, 'loss-damage')) {
			const ws = createTabSheet('Loss & Damage');
			const ld = report.lossAndDamage ?? {};
			const lds = ld.summary ?? {};

			addSection(
				ws,
				'LOSS & DAMAGE SUMMARY',
				['Metric', 'Incidents Count'],
				[
					['Missing', lds.periodMissing ?? 0],
					['Damaged', lds.periodDamaged ?? 0],
					['Total Incidents', lds.periodTotal ?? 0]
				],
				['text', 'integer']
			);

			if ((ld.tracking ?? []).length) {
				addSection(
					ws,
					'LOSS & DAMAGE TRACKING',
					[
						'Type',
						'Item',
						'Category / Location',
						'Student',
						'Status',
						'Incident Date',
						'Days to Resolve',
						'Request Status'
					],
					ld.tracking.map(
						(t: {
							type: string;
							itemName: string;
							itemCategory: string;
							studentName: string;
							status: string;
							incidentDate: string;
							daysToResolve?: number;
							requestStatus?: string;
						}) => [
							t.type.toUpperCase(),
							t.itemName,
							t.itemCategory,
							t.studentName,
							t.status,
							fmtDate(t.incidentDate),
							t.daysToResolve !== null && t.daysToResolve !== undefined
								? `${t.daysToResolve} days`
								: 'Pending',
							t.requestStatus ?? 'N/A'
						]
					)
				);
			}
		}

		// ── TAB 4: Inventory ──────────────────────────────────────────────────
		if (shouldExportSection(enabledSections, 'inventory')) {
			const ws = createTabSheet('Inventory');
			const inv = report.inventory ?? {};
			const invs = inv.summary ?? {};

			const varianceRows = (inv.eomVariance ?? []).filter(
				(item: { variance: number }) => item.variance !== 0
			);
			const inventoryOverTotalVal = varianceRows.reduce(
				(sum: number, item: { variance: number }) =>
					item.variance > 0 ? sum + item.variance : sum,
				0
			);
			const inventoryShortTotalVal = varianceRows.reduce(
				(sum: number, item: { variance: number }) =>
					item.variance < 0 ? sum + item.variance : sum,
				0
			);

			addSection(
				ws,
				'INVENTORY ANALYTICS SUMMARY',
				['Metric', 'Value'],
				[
					['Current Count', invs.currentCount ?? 0],
					['EOM Count', invs.eomCount ?? 0],
					['Over', inventoryOverTotalVal > 0 ? inventoryOverTotalVal : 0],
					['Variance', Math.abs(inventoryShortTotalVal)]
				],
				['text', 'integer']
			);

			if (varianceRows.length) {
				addSection(
					ws,
					'VARIANCE ITEMS',
					['Item', 'Category / Location', 'Current Count', 'EOM Count', 'Variance'],
					varianceRows.map(
						(i: {
							name: string;
							category: string;
							quantity: number;
							eomCount: number;
							variance: number;
						}) => [
							i.name,
							i.category,
							i.quantity,
							i.eomCount,
							i.variance
						]
					),
					['text', 'text', 'integer', 'integer', 'integer']
				);
			}

			if ((inv.varianceDrivers ?? []).length) {
				addSection(
					ws,
					'RELATED REQUESTS',
					[
						'Request ID',
						'Student Name',
						'Request Date',
						'Status',
						'Item Name',
						'Total Borrowed Quantity'
					],
					inv.varianceDrivers.map(
						(d: {
							latestRequestId?: string;
							studentName?: string;
							latestRequestDate?: string;
							latestRequestStatus?: string;
							name?: string;
							totalBorrowedQuantity?: number;
						}) => [
							d.latestRequestId ?? 'N/A',
							d.studentName ?? 'Unknown Student',
							d.latestRequestDate ? fmtDate(d.latestRequestDate) : 'No date',
							d.latestRequestStatus ?? 'N/A',
							d.name ?? '',
							d.totalBorrowedQuantity ?? 0
						]
					),
					['text', 'text', 'text', 'text', 'text', 'integer']
				);
			}

			if ((inv.stockAdjustments ?? []).length) {
				addSection(
					ws,
					'STOCK ADJUSTMENT ACTIVITY',
					['Item', 'Type', 'Quantity', 'Reason / Notes', 'Date'],
					inv.stockAdjustments.map(
						(a: {
							itemName: string;
							purpose: string;
							quantity: number;
							notes?: string;
							date?: string;
							createdAt?: string;
						}) => {
							const type = a.purpose === 'restock' ? 'Restock' : 'Loss/Damage';
							const dateStr =
								a.date || a.createdAt
									? new Date(a.date || a.createdAt!).toLocaleString('en-US', {
											month: 'short',
											day: 'numeric',
											year: 'numeric',
											hour: 'numeric',
											minute: '2-digit',
											hour12: true
										})
									: 'N/A';
							return [a.itemName, type, a.quantity, a.notes || '', dateStr];
						}
					),
					['text', 'text', 'integer', 'text', 'text']
				);
			}
		}

		// ── TAB 5: Student Risk ───────────────────────────────────────────────
		if (shouldExportSection(enabledSections, 'students')) {
			const ws = createTabSheet('Student Risk');
			const sr = report.studentRisk ?? {};

			const studentTrustScoresList = (sr.trustScores ?? []).filter(
				(student: { trustScore?: number }) => typeof student.trustScore === 'number'
			);
			const averageTrustScoreVal =
				studentTrustScoresList.length > 0
					? Math.round(
							studentTrustScoresList.reduce(
								(sum: number, student: { trustScore?: number }) => sum + (student.trustScore ?? 0),
								0
							) / studentTrustScoresList.length
						)
					: 0;

			const highIncidentCount = (sr.repeatOffenders ?? []).length;

			addSection(
				ws,
				'STUDENT RISK OVERVIEW',
				['Metric', 'Value'],
				[
					['Students', studentTrustScoresList.length],
					['Average Trust Score', averageTrustScoreVal],
					['High Incident Students', highIncidentCount]
				],
				['text', 'integer']
			);

			if (studentTrustScoresList.length) {
				addSection(
					ws,
					'STUDENT TRUST SCORES',
					[
						'Student',
						'Email',
						'Tier',
						'Trust Score',
						'Requests Total',
						'Returned Total',
						'Active Obligations'
					],
					studentTrustScoresList.map(
						(s: {
							studentName: string;
							studentEmail: string;
							trustScore?: number;
							trustTierLabel?: string;
							trustTier?: string;
							requestsTotal?: number;
							requestsReturned?: number;
							activeObligations?: number;
						}) => [
							s.studentName,
							s.studentEmail,
							s.trustTierLabel ?? s.trustTier ?? '',
							s.trustScore !== undefined ? Math.round(s.trustScore) : '',
							s.requestsTotal ?? 0,
							s.requestsReturned ?? 0,
							s.activeObligations ?? 0
						]
					),
					['text', 'text', 'text', 'integer', 'integer', 'integer', 'integer']
				);
			}
		}

		if (wb.worksheets.length === 0) {
			return new Response('No export sections matched the requested filters', { status: 400 });
		}

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
