<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { CheckCircle2, X, ScanLine } from 'lucide-svelte';

	interface Props {
		onResult: (rawId: string) => void;
		onClose: () => void;
	}

	let { onResult, onClose }: Props = $props();

	type Status = 'starting' | 'scanning' | 'error';
	let status = $state<Status>('starting');
	let errorMsg = $state('');
	let cameras = $state<{ id: string; label: string }[]>([]);
	let selectedId = $state('');

	const ELEMENT_ID = 'qr-scanner-region';
	let scanner: any = null;

	onMount(async () => {
		await startScanner();
	});

	onDestroy(() => {
		stopScanner();
	});

	async function startScanner(deviceId?: string) {
		await stopScanner();
		status = 'starting';
		errorMsg = '';

		try {
			const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

			// Enumerate cameras on first run
			if (cameras.length === 0) {
				try {
					const devices = await Html5Qrcode.getCameras();
					cameras = devices.map(d => ({ id: d.id, label: d.label || `Camera ${cameras.length + 1}` }));
					// Prefer rear camera
					const rear = cameras.find(c => /back|rear|environment|phone/i.test(c.label));
					selectedId = deviceId ?? rear?.id ?? cameras[cameras.length - 1]?.id ?? '';
				} catch {
					// Permission not yet granted — proceed anyway, html5-qrcode will request it
				}
			} else {
				selectedId = deviceId ?? selectedId;
			}

			scanner = new Html5Qrcode(ELEMENT_ID, { verbose: false });

			const config = {
				fps: 10,
				qrbox: { width: 220, height: 220 },
				aspectRatio: 1.0,
				formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE]
			};

			const cameraConfig = selectedId
				? { deviceId: { exact: selectedId } }
				: { facingMode: 'environment' };

			await scanner.start(
				cameraConfig,
				config,
				(decodedText: string) => {
					stopScanner();
					onResult(decodedText);
				},
				() => {} // ignore per-frame errors
			);

			status = 'scanning';
		} catch (err: any) {
			status = 'error';
			errorMsg = err?.message?.includes('Permission')
				? 'Camera permission denied. Please allow camera access and try again.'
				: 'Could not start camera. Use the photo upload instead.';
		}
	}

	async function stopScanner() {
		if (scanner) {
			try {
				if (scanner.isScanning) await scanner.stop();
				scanner.clear();
			} catch {}
			scanner = null;
		}
	}

	async function switchCamera(id: string) {
		selectedId = id;
		await startScanner(id);
	}

	async function handleFileInput(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		status = 'starting';
		errorMsg = '';
		try {
			const { Html5Qrcode } = await import('html5-qrcode');
			const reader = new Html5Qrcode('qr-file-reader', { verbose: false });
			const result = await reader.scanFile(file, false);
			try { reader.clear(); } catch {}
			onResult(result);
		} catch {
			status = 'error';
			errorMsg = 'No QR code found in the image. Try a clearer photo.';
		}
	}
</script>

<!-- Hidden element required by html5-qrcode for file scanning -->
<div id="qr-file-reader" class="hidden"></div>

<div class="space-y-3">
	<!-- Viewfinder — always in DOM so html5-qrcode can attach -->
	<div class="relative overflow-hidden rounded-2xl bg-black" style="min-height: 260px;">
		<div id={ELEMENT_ID} class="w-full"></div>

		<!-- Starting overlay -->
		{#if status === 'starting'}
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black rounded-2xl">
				<div class="h-10 w-10 animate-spin rounded-full border-4 border-gray-600 border-t-pink-500"></div>
				<p class="text-sm text-white/70">Starting camera…</p>
			</div>
		{/if}

		<!-- Error overlay -->
		{#if status === 'error'}
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black rounded-2xl px-6">
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
					<X size={22} class="text-red-400" />
				</div>
				<p class="text-center text-xs text-white/70">{errorMsg}</p>
			</div>
		{/if}

		<!-- Scanning frame -->
		{#if status === 'scanning'}
			<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
				<div class="relative h-52 w-52">
					<span class="absolute left-0 top-0 h-8 w-8 rounded-tl-lg border-l-4 border-t-4 border-pink-400"></span>
					<span class="absolute right-0 top-0 h-8 w-8 rounded-tr-lg border-r-4 border-t-4 border-pink-400"></span>
					<span class="absolute bottom-0 left-0 h-8 w-8 rounded-bl-lg border-b-4 border-l-4 border-pink-400"></span>
					<span class="absolute bottom-0 right-0 h-8 w-8 rounded-br-lg border-b-4 border-r-4 border-pink-400"></span>
					<span class="absolute inset-x-2 h-0.5 animate-[scan_2s_ease-in-out_infinite] bg-pink-400/80 shadow-[0_0_8px_2px_rgba(236,72,153,0.5)]"></span>
				</div>
			</div>
		{/if}
	</div>

	<!-- Camera selector -->
	{#if cameras.length > 1}
		<select
			value={selectedId}
			onchange={(e) => switchCamera((e.target as HTMLSelectElement).value)}
			class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
		>
			{#each cameras as cam, i}
				<option value={cam.id}>{cam.label || `Camera ${i + 1}`}</option>
			{/each}
		</select>
	{/if}

	{#if status === 'scanning'}
		<p class="text-center text-xs text-gray-400">Align the QR code within the frame — detects automatically</p>
	{/if}

	{#if status === 'error'}
		<button onclick={() => startScanner()} class="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
			Try Camera Again
		</button>
	{/if}

	<!-- File upload fallback — always visible -->
	<label class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 py-2.5 text-xs font-medium text-gray-500 hover:border-pink-400 hover:text-pink-600 transition-colors">
		<ScanLine size={14} /> Upload QR photo instead
		<input type="file" accept="image/*" capture="environment" class="hidden" onchange={handleFileInput} />
	</label>
</div>
