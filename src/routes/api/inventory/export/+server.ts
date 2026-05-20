import type { RequestHandler } from './$types';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { InventoryItem } from '$lib/server/models/InventoryItem';

const ALLOWED_ROLES = new Set(['custodian', 'instructor', 'superadmin']);

// Colour palette (CHTM brand + professional report styling)
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
const COL_WIDTH = 25; // uniform minimum column width

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

interface ImageSize {
	width: number;
	height: number;
}

function getImageDimensions(buffer: Buffer): ImageSize | null {
	try {
		if (buffer.length < 8) return null;

		// Check PNG signature
		if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
			if (buffer.length >= 24) {
				const width = buffer.readUInt32BE(16);
				const height = buffer.readUInt32BE(20);
				return { width, height };
			}
		}

		// Check GIF signature
		if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
			if (buffer.length >= 10) {
				const width = buffer.readUInt16LE(6);
				const height = buffer.readUInt16LE(8);
				return { width, height };
			}
		}

		// Check JPEG signature (SOI: 0xFFD8)
		if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
			let i = 2;
			while (i < buffer.length - 8) {
				if (buffer[i] !== 0xFF) {
					i++;
					continue;
				}
				const marker = buffer[i + 1];
				if (marker === 0xFF) {
					i++;
					continue;
				}
				if (marker === 0xD9 || marker === 0xDA) { // EOI or SOS
					break;
				}
				if ((marker >= 0xC0 && marker <= 0xCF) && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
					const height = buffer.readUInt16BE(i + 5);
					const width = buffer.readUInt16BE(i + 7);
					return { width, height };
				}
				const length = buffer.readUInt16BE(i + 2);
				i += 2 + length;
			}
		}
	} catch (err) {
		logger.error('Error parsing image dimensions:', err);
	}
	return null;
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

function setColumnWidths(sheet: ExcelJS.Worksheet, activeColCount: number, imageColIndex: number): void {
	for (let c = 1; c <= activeColCount; c++) {
		const col = sheet.getColumn(c);
		col.width = c === imageColIndex ? 18 : COL_WIDTH;
		col.hidden = false;
	}
	for (let c = activeColCount + 1; c <= 12; c++) {
		const col = sheet.getColumn(c);
		col.hidden = true;
	}
}

const LOGO_SCALE = 0.78;

function logoWidthPx(): number {
	return Math.round((COL_WIDTH * 6.5 - 12) * LOGO_SCALE);
}

function logoHeightPx(firstRow: number, lastRow: number, rowHeightPt: number): number {
	const rowCount = lastRow - firstRow + 1;
	return Math.round(rowCount * rowHeightPt * (96 / 72) * 0.88 * LOGO_SCALE);
}

function applyHeaderRow(row: ExcelJS.Row, activeColCount: number): void {
	for (let col = 1; col <= activeColCount; col++) {
		const cell = row.getCell(col);
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PINK_HEADER } };
		cell.font = { name: FONT, bold: true, color: { argb: WHITE }, size: 11 };
		cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
		cell.border = thinBorder;
	}
	row.height = 24;
}

function applySectionTitle(row: ExcelJS.Row, activeColCount: number): void {
	const cell = row.getCell(1);
	cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PINK_LIGHT } };
	cell.font = { name: FONT, bold: true, color: { argb: PINK_SECTION }, size: 11 };
	cell.alignment = { vertical: 'middle', horizontal: 'left' };
	cell.border = {
		top: { style: 'medium', color: { argb: PINK_HEADER } },
		bottom: { style: 'thin', color: { argb: BORDER_COLOR } }
	};
	row.worksheet.mergeCells(row.number, 1, row.number, activeColCount);
	for (let col = 2; col <= activeColCount; col++) {
		const c = row.getCell(col);
		c.fill = cell.fill;
		c.border = cell.border;
	}
	row.height = 24;
}

type ColumnFormat = 'text' | 'integer' | 'decimal';

function applyDataRow(
	row: ExcelJS.Row,
	isAlt: boolean,
	columnFormats: ColumnFormat[],
	activeColCount: number,
	hasImageColumn: boolean
): void {
	const activeCols = Array.from({ length: activeColCount }, (_, i) => i + 1);

	for (let col = 1; col <= activeColCount; col++) {
		const cell = row.getCell(col);
		const fmt = columnFormats[col - 1] ?? 'text';
		cell.fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: isAlt ? ROW_ALT : WHITE }
		};
		cell.font = { name: FONT, size: 11, color: { argb: DARK } };
		cell.border = thinBorder;

		if (fmt === 'integer' || fmt === 'decimal') {
			cell.alignment = { vertical: 'middle', horizontal: 'right' };
			if (typeof cell.value === 'string' && cell.value !== '') {
				const parsed = Number(cell.value.replace(/[%,+]/g, ''));
				if (!Number.isNaN(parsed)) cell.value = parsed;
			}
			if (fmt === 'integer') cell.numFmt = '#,##0';
			else if (fmt === 'decimal') cell.numFmt = '#,##0.00';
		} else {
			cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
		}
	}
	row.height = hasImageColumn ? 55 : estimateRowHeight(row, activeCols);
}

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
		
		// Parse query parameters
		const sheetsParam = url.searchParams.get('sheets') || 'all-items';
		const columnsParam = url.searchParams.get('columns') || 'category,specification,tools';
		const categoriesParam = url.searchParams.get('categories');
		const specificationsParam = url.searchParams.get('specifications');
		const toolsParam = url.searchParams.get('tools');

		const selectedSheets = new Set(sheetsParam.split(',').map((s) => s.trim().toLowerCase()));
		const selectedColumns = new Set(columnsParam.split(',').map((s) => s.trim().toLowerCase()));

		const getFilterSet = (paramValue: string | null): Set<string> | null => {
			if (paramValue === null) return null;
			return new Set(paramValue.split(',').map((s) => s.trim().toLowerCase()));
		};

		const allowedCategories = getFilterSet(categoriesParam);
		const allowedSpecifications = getFilterSet(specificationsParam);
		const allowedTools = getFilterSet(toolsParam);

		// Connect to database and fetch items
		const db = await getDatabase();
		const itemsCollection = db.collection<InventoryItem>('inventory_items');
		const rawItems = await itemsCollection.find({ archived: false }).sort({ name: 1 }).toArray();

		// Apply sub-selection filtering
		const allItems = rawItems.filter((item) => {
			if (allowedCategories !== null) {
				const catVal = (item.category || '').trim().toLowerCase();
				if (!allowedCategories.has(catVal)) return false;
			}
			if (allowedSpecifications !== null) {
				const specVal = (item.specification || '').trim().toLowerCase();
				if (!allowedSpecifications.has(specVal)) return false;
			}
			if (allowedTools !== null) {
				const toolsVal = (item.toolsOrEquipment || '').trim().toLowerCase();
				if (!allowedTools.has(toolsVal)) return false;
			}
			return true;
		});

		// Build workbook
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

		// Cache resolved images to avoid duplicate disk reads or network requests
		const imageCache = new Map<string, { buffer: Buffer; extension: 'png' | 'jpeg' | 'gif'; width: number; height: number } | null>();

		const fetchImageAsBuffer = async (urlOrPath: string): Promise<{ buffer: Buffer; extension: 'png' | 'jpeg' | 'gif'; width: number; height: number } | null> => {
			if (!urlOrPath) return null;
			if (imageCache.has(urlOrPath)) return imageCache.get(urlOrPath)!;

			try {
				let buffer: Buffer;
				let extension: 'png' | 'jpeg' | 'gif' = 'png';

				const ext = urlOrPath.split('?')[0].split('.').pop()?.toLowerCase();
				if (ext === 'jpg' || ext === 'jpeg') {
					extension = 'jpeg';
				} else if (ext === 'gif') {
					extension = 'gif';
				} else {
					extension = 'png';
				}

				if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
					const res = await fetch(urlOrPath);
					if (!res.ok) {
						imageCache.set(urlOrPath, null);
						return null;
					}
					const arrayBuffer = await res.arrayBuffer();
					buffer = Buffer.from(arrayBuffer);
				} else {
					let filePath = '';
					if (urlOrPath.startsWith('/uploads/')) {
						filePath = resolve('static' + urlOrPath);
					} else if (urlOrPath.startsWith('uploads/')) {
						filePath = resolve('static/' + urlOrPath);
					} else {
						filePath = resolve(urlOrPath);
					}
					buffer = readFileSync(filePath);
				}

				const dimensions = getImageDimensions(buffer);
				const width = dimensions?.width ?? 100;
				const height = dimensions?.height ?? 100;

				const result = { buffer, extension, width, height };
				imageCache.set(urlOrPath, result);
				return result;
			} catch (err) {
				logger.error('Failed to resolve image for export:', { urlOrPath, error: err });
				imageCache.set(urlOrPath, null);
				return null;
			}
		};

		const gcLogoId = loadSheetImage('src/lib/assets/GC_LOGO.png');
		const chtmSealId = loadSheetImage('src/lib/assets/CHTM.png');
		const chtmCooksLogoId = loadSheetImage('src/lib/assets/CHTM_LOGO.png');

		// Determine columns structure dynamically
		const headers: string[] = ['Item Name'];
		const fields: string[] = ['name'];
		const formats: ColumnFormat[] = ['text'];

		if (selectedColumns.has('category')) {
			headers.push('Category');
			fields.push('category');
			formats.push('text');
		}
		if (selectedColumns.has('specification')) {
			headers.push('Specification');
			fields.push('specification');
			formats.push('text');
		}
		if (selectedColumns.has('tools')) {
			headers.push('Tools / Equipment');
			fields.push('toolsOrEquipment');
			formats.push('text');
		}
		if (selectedColumns.has('image')) {
			headers.push('Image');
			fields.push('picture');
			formats.push('text');
		}

		// Append standard numeric columns
		headers.push('Current Count', 'Donations', 'EOM Count', 'Variance', 'Status');
		fields.push('quantity', 'donations', 'eomCount', 'variance', 'status');
		formats.push('integer', 'integer', 'integer', 'integer', 'text');

		const activeColCount = headers.length;

		// Helper to create a worksheet
		const createSheet = async (sheetName: string, titleText: string, filteredList: InventoryItem[]) => {
			// sheetName limited to 31 chars in Excel
			const ws = wb.addWorksheet(sheetName.substring(0, 31), {
				pageSetup: { paperSize: 9, orientation: 'portrait' },
				properties: { defaultRowHeight: 22, defaultColWidth: COL_WIDTH }
			});

			const imageColIndex = fields.indexOf('picture') + 1; // 1-indexed (0 if not found)
			setColumnWidths(ws, activeColCount, imageColIndex);

			// Header spacing
			ws.getRow(1).height = 6;
			const HEADER_FIRST_ROW = 2;
			const HEADER_LAST_ROW = 5;
			const HEADER_ROW_HEIGHT = 38;

			for (let r = HEADER_FIRST_ROW; r <= HEADER_LAST_ROW; r++) {
				ws.getRow(r).height = HEADER_ROW_HEIGHT;
			}

			// Merge cells for logo in cols 1, 2, 3
			for (let c = 1; c <= 3; c++) {
				const colLetter = String.fromCharCode(64 + c);
				ws.mergeCells(`${colLetter}${HEADER_FIRST_ROW}:${colLetter}${HEADER_LAST_ROW}`);
				const cell = ws.getCell(`${colLetter}${HEADER_FIRST_ROW}`);
				cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
				cell.alignment = { vertical: 'middle', horizontal: 'center' };
			}

			// Main Title block merged across column 4 to activeColCount - 2
			const startColLetter = 'D';
			const endColIndex = Math.max(4, activeColCount - 2);
			const endColLetter = String.fromCharCode(64 + endColIndex);
			
			ws.mergeCells(`${startColLetter}${HEADER_FIRST_ROW}:${endColLetter}${HEADER_LAST_ROW}`);
			const titleCell = ws.getCell('D2');
			titleCell.value = {
				richText: [
					{
						text: 'COLLEGE OF HOSPITALITY AND TOURISM MANAGEMENT\n',
						font: { name: FONT, bold: true, size: 12, color: { argb: DARK } }
					},
					{
						text: 'GORDON COLLEGE\n',
						font: { name: FONT, bold: true, size: 11, color: { argb: DARK } }
					},
					{
						text: 'OLONGAPO CITY',
						font: { name: FONT, size: 10, color: { argb: MUTED } }
					}
				]
			};
			titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

			// Meta Block on the far right
			const metaFirstColIndex = endColIndex + 1;
			const metaSecondColIndex = activeColCount;
			
			const metaFirstColLetter = String.fromCharCode(64 + metaFirstColIndex);
			const metaSecondColLetter = String.fromCharCode(64 + metaSecondColIndex);

			const applyBoxCell = (
				rowNum: number,
				label: string,
				value: string,
				opts: { bold?: boolean; isLabel?: boolean } = {}
			) => {
				const cellL = ws.getCell(`${metaFirstColLetter}${rowNum}`);
				cellL.value = label;
				cellL.font = { name: FONT, bold: true, size: 9, color: { argb: PINK_SECTION } };
				cellL.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PINK_LIGHT } };
				cellL.alignment = { horizontal: 'left', vertical: 'middle' };
				cellL.border = thinBorder;

				const cellV = ws.getCell(`${metaSecondColLetter}${rowNum}`);
				cellV.value = value;
				cellV.font = { name: FONT, bold: opts.bold ?? false, size: 9, color: { argb: DARK } };
				cellV.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
				cellV.alignment = { horizontal: 'center', vertical: 'middle' };
				cellV.border = thinBorder;

				// Merge any remaining columns between metaFirstCol and metaSecondCol if layout allows
				if (metaSecondColIndex - metaFirstColIndex > 1) {
					ws.mergeCells(rowNum, metaFirstColIndex, rowNum, metaSecondColIndex - 1);
				}
			};

			const todayStr = new Date().toLocaleDateString('en-US', {
				month: 'long',
				day: 'numeric',
				year: 'numeric'
			});

			applyBoxCell(2, 'Date Generated', todayStr);
			applyBoxCell(3, 'Report Type', sheetName);
			applyBoxCell(4, 'Counted by', userName);
			applyBoxCell(5, 'Verified by', '');

			// Place Logos
			const logoW = logoWidthPx();
			const logoH = logoHeightPx(HEADER_FIRST_ROW, HEADER_LAST_ROW, HEADER_ROW_HEIGHT);
			const placeLogo = (imageId: number | null, colIndex: number) => {
				if (imageId === null) return;
				const colPx = COL_WIDTH * 7 + 5;
				const rowPx = (HEADER_LAST_ROW - HEADER_FIRST_ROW + 1) * HEADER_ROW_HEIGHT * (96 / 72);
				const xInset = Math.max(0.05, (colPx - logoW) / 2 / colPx);
				const yInset = Math.max(0.1, (rowPx - logoH) / 2 / rowPx);
				ws.addImage(imageId, {
					tl: { col: colIndex + xInset, row: HEADER_FIRST_ROW - 1 + yInset },
					ext: { width: logoW, height: logoH }
				});
			};

			placeLogo(gcLogoId, 0);
			placeLogo(chtmSealId, 1);
			placeLogo(chtmCooksLogoId, 2);

			ws.addRow([]); // Blank row
			
			// Section Title
			const sectionRow = ws.addRow([titleText.toUpperCase()]);
			applySectionTitle(sectionRow, activeColCount);

			// Table Header Row
			const headerRow = ws.addRow(headers);
			applyHeaderRow(headerRow, activeColCount);

			// Populate Data Rows
			for (let index = 0; index < filteredList.length; index++) {
				const item = filteredList[index];
				const rowData = fields.map((f) => {
					if (f === 'quantity') {
						return (item.quantity ?? 0) + (item.donations ?? 0);
					}
					if (f === 'variance') {
						const currentCount = (item.quantity ?? 0) + (item.donations ?? 0);
						return currentCount - (item.eomCount ?? 0);
					}
					if (f === 'status') {
						const quantity = item.quantity ?? 0;
						const donations = item.donations ?? 0;
						const total = quantity + donations;
						if (total === 0) return 'Out of Stock';
						if (total <= 5) return 'Low Stock';
						return 'In Stock';
					}
					if (f === 'picture') {
						return '';
					}
					return (item as any)[f] ?? '';
				});

				const dataRow = ws.addRow(rowData);
				applyDataRow(dataRow, index % 2 === 1, formats, activeColCount, imageColIndex > 0);

				if (imageColIndex > 0 && item.picture) {
					const imgRes = await fetchImageAsBuffer(item.picture);
					if (imgRes) {
						try {
							const imageId = wb.addImage({
								buffer: imgRes.buffer as any,
								extension: imgRes.extension
							});

							const cellWidthPx = 135;
							const cellHeightPx = 73;
							const maxImgWidth = cellWidthPx - 10;
							const maxImgHeight = cellHeightPx - 10;

							let imgWidth = imgRes.width;
							let imgHeight = imgRes.height;
							const aspectRatio = imgWidth / imgHeight;

							if (aspectRatio > maxImgWidth / maxImgHeight) {
								imgWidth = maxImgWidth;
								imgHeight = Math.round(maxImgWidth / aspectRatio);
							} else {
								imgHeight = maxImgHeight;
								imgWidth = Math.round(maxImgHeight * aspectRatio);
							}

							const leftPaddingPx = (cellWidthPx - imgWidth) / 2;
							const topPaddingPx = (cellHeightPx - imgHeight) / 2;

							const colOffset = leftPaddingPx / cellWidthPx;
							const rowOffset = topPaddingPx / cellHeightPx;

							ws.addImage(imageId, {
								tl: { col: imageColIndex - 1 + colOffset, row: dataRow.number - 1 + rowOffset },
								ext: { width: imgWidth, height: imgHeight },
								editAs: 'oneCell'
							} as any);
						} catch (embedErr) {
							logger.error('Failed to embed image in Excel row:', { itemId: item._id?.toString(), error: embedErr });
						}
					}
				}
			}

			ws.views = [{ showGridLines: false }];
			setColumnWidths(ws, activeColCount, imageColIndex);
		};

		// 1. All Items Worksheet
		if (selectedSheets.has('all-items')) {
			await createSheet('All Items', 'All Inventory Items Database', allItems);
		}

		// 2. Items Tab as a Whole Worksheet
		if (selectedSheets.has('items-tab')) {
			await createSheet('Inventory Items', 'Custodian Inventory Items Tab', allItems);
		}

		// 3. Required Worksheet
		if (selectedSheets.has('required-tab')) {
			const reqItems = allItems.filter((i) => i.isrequired === true);
			await createSheet('Required Items', 'Frequently Requested Required Items', reqItems);
		}

		// 4. Low & Out of Stock Worksheet
		if (selectedSheets.has('low-stock')) {
			const lowStock = allItems.filter((i) => {
				const total = (i.quantity ?? 0) + (i.donations ?? 0);
				return total <= 5;
			});
			await createSheet('Low & Out of Stock', 'Low & Out of Stock Inventory Items', lowStock);
		}

		// Write buffer
		const buffer = await wb.xlsx.writeBuffer();
		const filename = `chtm-cooks-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`;

		return new Response(buffer, {
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="${filename}"`
			}
		});

	} catch (err: any) {
		logger.error('Error generating inventory Excel report', { error: err });
		return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
