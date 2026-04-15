<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	const statusConfig = {
		404: {
			title: 'Page Not Found',
			lines: ["We looked everywhere for this page.", "Are you sure the URL is correct?", "Get in touch with your system administrator."],
		},
		403: {
			title: 'Access Denied',
			lines: ["You don't have permission to view this page.", "Contact your administrator if you think this is a mistake."],
		},
		500: {
			title: 'Internal Server Error',
			lines: ["Something went wrong on our end.", "Our team has been notified.", "Please try again in a moment."],
		},
		503: {
			title: 'Service Unavailable',
			lines: ["The service is temporarily down.", "Please try again shortly."],
		}
	} as const;

	type StatusKey = keyof typeof statusConfig;

	const status = $derived($page.status as StatusKey);
	const config = $derived(
		statusConfig[status] ?? {
			title: 'Unexpected Error',
			lines: ["An unexpected error occurred.", "Please try again or contact support."],
		}
	);

	const is5xx = $derived($page.status >= 500);
	const accent = $derived(is5xx ? '#f97316' : '#e91e8c');
	const accentLight = $derived(is5xx ? '#fff7ed' : '#fce4f3');
</script>

<svelte:head>
	<title>Error {$page.status} — {config.title} · CHTM Cooks</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center bg-white px-4 py-16">
	<div class="flex w-full max-w-lg flex-col items-center text-center">

		<!-- Illustration -->
		<div class="relative mb-8" style="width: 200px; height: 160px;">

			<!-- Browser window card -->
			<div class="absolute bottom-0 left-1/2 z-10 -translate-x-1/2 overflow-hidden rounded-2xl shadow-md"
				style="width: 148px; height: 112px; border: 2.5px solid {accent}; background: {accentLight};">
				<div class="absolute -right-2.75 top-4 h-0 w-0 border-y-[9px] border-y-transparent border-l-12" style="border-left-color: {accent};"></div>
				<!-- Title bar -->
				<div class="flex items-center gap-1.5 px-3 py-2" style="background: {accent};">
					<span class="h-2 w-2 rounded-full bg-white/40"></span>
					<span class="h-2 w-2 rounded-full bg-white/40"></span>
					<span class="h-2 w-2 rounded-full bg-white/40"></span>
				</div>
				<!-- Face -->
				<div class="flex flex-col items-center justify-center gap-2 py-3">
					<!-- Eyes -->
					<div class="flex gap-4">
						<span class="h-2.5 w-2.5 rounded-full bg-gray-700"></span>
						<span class="h-2.5 w-2.5 rounded-full bg-gray-700"></span>
					</div>
					<!-- Cheeks + mouth -->
					<div class="relative flex items-center justify-center">
						<span class="h-2.5 w-2.5 rounded-full opacity-80" style="background: {accent};"></span>
						<div class="mx-3 h-2.5 w-6 rounded-t-full border-t-[2.5px] border-x-[2.5px] border-gray-700"></div>
						<span class="h-2.5 w-2.5 rounded-full opacity-80" style="background: {accent};"></span>
					</div>
				</div>
			</div>

			<!-- Arrow pointer on right side of card -->
			<div class="absolute" style="
				top: 50px;
				right: 12px;
				width: 0; height: 0;
				border-top: 10px solid transparent;
				border-bottom: 10px solid transparent;
				border-left: 14px solid {accent};
			"></div>

			<!-- Status badge circle -->
			<div class="absolute -right-10 -top-5 z-0">
				<div class="relative flex h-25 w-25 items-center justify-center overflow-hidden rounded-full shadow-[0_12px_24px_rgba(233,30,140,0.18)]"
					style="background: {accent};">
					<span class="absolute left-5 top-5 h-4.5 w-4.5 rounded-full bg-white/20"></span>
					<span class="absolute left-8 top-9 h-2.5 w-2.5 rounded-full bg-white/18"></span>
					<span class="relative text-[1.95rem] font-medium leading-none tracking-tight text-white">{$page.status}</span>
				</div>
			</div>
		</div>

		<!-- Title -->
		<h1 class="text-4xl font-black uppercase tracking-wide" style="color: {accent}; letter-spacing: 0.06em;">
			{config.title}
		</h1>

		<!-- Description lines -->
		<div class="mt-4 space-y-1">
			{#each config.lines as line}
				<p class="text-sm text-gray-500">{line}</p>
			{/each}
		</div>

		<!-- Error detail box -->
		{#if $page.error?.message}
			<div class="mt-6 w-full rounded-2xl border border-gray-200 bg-white px-6 py-4">
				<p class="font-mono text-sm text-gray-500">{$page.error.message}</p>
			</div>
		{/if}

		<!-- Go Back Home button -->
		<button
			onclick={() => goto('/')}
			class="mt-8 rounded-2xl border-2 bg-white px-10 py-3 text-base font-semibold transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2"
			style="border-color: {accent}; color: {accent};"
		>
			Go Back Home
		</button>

	</div>
</div>
