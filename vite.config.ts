import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig(({ mode }) => ({
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			srcDir: './src',
			mode: mode === 'production' ? 'production' : 'development',
			strategies: 'generateSW',
			scope: '/',
			base: '/',
			selfDestroying: false,
			registerType: 'autoUpdate',
			injectRegister: 'script',
			manifest: {
				short_name: 'CHTM Cooks',
				name: 'CHTM Cooks - Laboratory Equipment Management',
				description:
					'Professional laboratory equipment management system for CHTM students, instructors, and custodians.',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				theme_color: '#e91e63',
				background_color: '#ffffff',
				orientation: 'any',
				categories: ['education', 'productivity', 'utilities'],
				icons: [
					{
						src: '/pwa-64x64.png',
						sizes: '64x64',
						type: 'image/png'
					},
					{
						src: '/pwa-192x192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: '/pwa-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: '/maskable-icon-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
				cleanupOutdatedCaches: true,
				clientsClaim: true,
				skipWaiting: true,
				runtimeCaching: [
					{
						urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
						handler: 'CacheFirst',
						options: {
							cacheName: 'google-fonts-cache',
							expiration: {
								maxEntries: 10,
								maxAgeSeconds: 60 * 60 * 24 * 365
							},
							cacheableResponse: {
								statuses: [0, 200]
							}
						}
					},
					{
						urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
						handler: 'CacheFirst',
						options: {
							cacheName: 'gstatic-fonts-cache',
							expiration: {
								maxEntries: 10,
								maxAgeSeconds: 60 * 60 * 24 * 365
							},
							cacheableResponse: {
								statuses: [0, 200]
							}
						}
					}
				]
			},
			devOptions: {
				enabled: true,
				suppressWarnings: true,
				type: 'module',
				navigateFallback: '/'
			}
		})
	],
	server: {
		port: 3000,
		warmup: {
			clientFiles: [
				'./src/routes/+layout.svelte',
				'./src/routes/+page.svelte',
				'./src/routes/layout.css',
				'./src/lib/components/ui/AIChatbot.svelte'
			],
			ssrFiles: [
				'./src/routes/+layout.svelte',
				'./src/routes/+layout.ts',
				'./src/routes/+page.svelte',
				'./src/hooks.server.ts'
			]
		}
	}
}));
