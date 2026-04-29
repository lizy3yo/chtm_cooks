/**
 * PWA Icon Generator Script
 * Generates all required PWA icons from the source CHTM_LOGO.png
 * 
 * Usage: node scripts/generate-pwa-icons.js
 * 
 * Requirements: Install sharp package
 * npm install -D sharp
 */

import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOURCE_LOGO = join(__dirname, '../src/lib/assets/CHTM_LOGO02.png');
const STATIC_DIR = join(__dirname, '../static');

// Ensure static directory exists
if (!existsSync(STATIC_DIR)) {
	mkdirSync(STATIC_DIR, { recursive: true });
}

const ICON_SIZES = [
	{ name: 'favicon-16x16.png', size: 16 },
	{ name: 'favicon-32x32.png', size: 32 },
	{ name: 'pwa-64x64.png', size: 64 },
	{ name: 'pwa-192x192.png', size: 192 },
	{ name: 'pwa-512x512.png', size: 512 },
	{ name: 'maskable-icon-512x512.png', size: 512, maskable: true }
];

async function generateIcons() {
	console.log('🎨 Generating PWA icons from CHTM_LOGO.png...\n');

	if (!existsSync(SOURCE_LOGO)) {
		console.error('❌ Error: CHTM_LOGO.png not found at:', SOURCE_LOGO);
		process.exit(1);
	}

	// Process source logo to remove black background and ensure transparency
	const processedLogo = await sharp(SOURCE_LOGO)
		.removeAlpha() // Remove existing alpha channel
		.negate({ alpha: false }) // Prepare for threshold
		.threshold(10, { grayscale: false }) // Remove near-black pixels
		.negate({ alpha: false }) // Restore original colors
		.toBuffer();

	// Create a version with transparent background by removing black/dark pixels
	const transparentLogo = await sharp(processedLogo)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	// Convert black pixels to transparent
	const { data, info } = transparentLogo;
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		// If pixel is dark (near black), make it transparent
		if (r < 30 && g < 30 && b < 30) {
			data[i + 3] = 0; // Set alpha to 0 (transparent)
		}
	}

	const finalLogo = await sharp(data, {
		raw: {
			width: info.width,
			height: info.height,
			channels: 4
		}
	})
		.png()
		.toBuffer();

	for (const icon of ICON_SIZES) {
		try {
			const outputPath = join(STATIC_DIR, icon.name);

			if (icon.maskable) {
				// For maskable icons, add padding (safe zone) with white background
				// Industry standard: 10% safe zone for maskable icons
				const padding = Math.floor(icon.size * 0.1);
				const innerSize = icon.size - padding * 2;

				await sharp(finalLogo)
					.resize(innerSize, innerSize, {
						fit: 'contain',
						background: { r: 255, g: 255, b: 255, alpha: 1 }
					})
					.extend({
						top: padding,
						bottom: padding,
						left: padding,
						right: padding,
						background: { r: 255, g: 255, b: 255, alpha: 1 }
					})
					.png()
					.toFile(outputPath);
			} else {
				// Standard icons with transparent background
				await sharp(finalLogo)
					.resize(icon.size, icon.size, {
						fit: 'contain',
						background: { r: 0, g: 0, b: 0, alpha: 0 }
					})
					.png()
					.toFile(outputPath);
			}

			console.log(`✅ Generated: ${icon.name} (${icon.size}x${icon.size})`);
		} catch (error) {
			console.error(`❌ Error generating ${icon.name}:`, error.message);
		}
	}

	// Generate placeholder screenshots
	await generatePlaceholderScreenshots();

	console.log('\n✨ All PWA icons generated successfully!');
	console.log('\n📝 Next steps:');
	console.log('   1. Replace placeholder screenshots in /static with real ones');
	console.log('   2. Run: npm run build');
	console.log('   3. Deploy your PWA-enabled app\n');
}

async function generatePlaceholderScreenshots() {
	console.log('\n📸 Generating placeholder screenshots...');

	// Wide screenshot (desktop)
	await sharp({
		create: {
			width: 1280,
			height: 720,
			channels: 4,
			background: { r: 233, g: 30, b: 99, alpha: 1 }
		}
	})
		.composite([
			{
				input: Buffer.from(
					'<svg width="1280" height="720"><text x="50%" y="50%" text-anchor="middle" font-size="48" fill="white" font-family="Arial">CHTM Cooks Dashboard</text></svg>'
				),
				top: 0,
				left: 0
			}
		])
		.png()
		.toFile(join(STATIC_DIR, 'screenshot-wide.png'));

	console.log('✅ Generated: screenshot-wide.png (1280x720)');

	// Mobile screenshot
	await sharp({
		create: {
			width: 750,
			height: 1334,
			channels: 4,
			background: { r: 233, g: 30, b: 99, alpha: 1 }
		}
	})
		.composite([
			{
				input: Buffer.from(
					'<svg width="750" height="1334"><text x="50%" y="50%" text-anchor="middle" font-size="36" fill="white" font-family="Arial">CHTM Cooks Mobile</text></svg>'
				),
				top: 0,
				left: 0
			}
		])
		.png()
		.toFile(join(STATIC_DIR, 'screenshot-mobile.png'));

	console.log('✅ Generated: screenshot-mobile.png (750x1334)');
}

// Run the generator
generateIcons().catch((error) => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
