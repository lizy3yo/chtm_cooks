import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		port: 3000,
		// Pre-transform critical app files so dev cold-start cost happens
		// at server boot, not on the first user request.
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
});
