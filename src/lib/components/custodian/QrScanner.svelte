<script lang="ts">
	/**
	 * QrScanner — GCash-style approach:
	 * - Mobile: native camera input (no getUserMedia needed, no permission issues)
	 * - Desktop: live camera via getUserMedia + jsQR frame scanning
	 * - Both: file upload fallback with jsQR decoding
	 */
	import { onMount, onDestroy } from 'svelte';
	import { ScanLine, Camera, Upload } from 'lucide-svelte';

	interface Props {
		onResult: (rawId: string) => void;
	}

	let { onResult }: Props = $props();

	type Mode = 'choose' | 'live' | 'processing' | 'error';
	let mode = $state<Mode>('choose');
	let errorMsg = $state('');
	let isMobile = $state(false);

	// Live camera state (desktop)
	let videoEl: HTMLVideoElement | null = null;
	let canvasEl: HTMLCanvasElement | null = null;
	let stream: MediaStream | null = null;
	let rafId: number | null = null;
	let cameras = $state<MediaDeviceInfo[]>([]);
	let selectedDeviceId = $state('');

	onMount(() => {
		// Detect mobile — use native camera input as primary on mobile
		isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
	});

	onDestroy(() => {
		stopLive();
	});

	// ── Native camera input (mobile primary) ─────────────────────────────────
	async function handleNativeCapture(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		await decodeFile(file);
		// Reset input so same file can be re-selected
		(e.target as HTMLInputElement).value = '';
	}

	// ── File upload (any device fallback) ────────────────────────────────────
	async function handleFileUpload(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		await decodeFile(file);
		(e.target as HTMLInputElement).value = '';
	}

	async function decodeFile(file: File) {
		mode = 'processing';
		errorMsg = '';
		try {
			const { default: jsQR } = await import('jsqr');
			const bitmap = await createImageBitmap(file);
			const canvas = document.createElement('canvas');
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			const ctx = canvas.getContext('2d')!;
			ctx.drawImage(bitmap, 0, 0);
			const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
			const result = jsQR(imageData.data, bitmap.width, bitmap.height);
			if (result?.data) {
				onResult(result.data);
			} else {
				mode = 'error';
				errorMsg = 'No QR code found. Make sure the QR is clear and try again.';
			}
		} catch {
			mode = 'error';
			errorMsg = 'Could not read the image. Please try again.';
		}
	}

	// ── Live camera (desktop) ─────────────────────────────────────────────────
	async function startLive() {
		mode = 'live';
		errorMsg = '';
		try {
			// Enumerate cameras
			const probe = await navigator.mediaDevices.getUserMedia({ video: true });
			probe.getTracks().forEach(t => t.stop());
			const devices = await navigator.mediaDevices.enumerateDevices();
			cameras = devices.filter(d => d.kind === 'videoinput');
			const rear = cameras.find(c => /back|rear|environment|phone/i.test(c.label));
			selectedDeviceId = rear?.deviceId ?? cameras[cameras.length - 1]?.deviceId ?? '';
			await startStream(selectedDeviceId);
		} catch {
			mode = 'error';
			errorMsg = 'Camera access denied. Please allow camera access in your browser settings.';
		}
	}

	async function startStream(deviceId: string) {
		stopLive();
		try {
			const constraints: MediaStreamConstraints = deviceId
				? { video: { deviceId: { exact: deviceId } } }
				: { video: { facingMode: 'environment' } };
			stream = await navigator.mediaDevices.getUserMedia(constraints);
			if (!videoEl) return;
			videoEl.srcObject = stream;
			await videoEl.play();
			scanFrames();
		} catch {
			mode = 'error';
			errorMsg = 'Could not start camera. Try uploading a photo instead.';
		}
	}

	function scanFrames() {
		if (!videoEl || !canvasEl || mode !== 'live') return;
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;

		async function tick() {
			if (!videoEl || !canvasEl || mode !== 'live') return;
			if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
				canvasEl.width = videoEl.videoWidth;
				canvasEl.height = videoEl.videoHeight;
				ctx!.drawImage(videoEl, 0, 0);
				const imageData = ctx!.getImageData(0, 0, canvasEl.width, canvasEl.height);
				try {
					const { default: jsQR } = await import('jsqr');
					const result = jsQR(imageData.data, imageData.width, imageData.height);
					if (result?.data) {
						stopLive();
						onResult(result.data);
						return;
					}
				} catch {}
			}
			rafId = requestAnimationFrame(tick);
		}
		rafId = requestAnimationFrame(tick);
	}

	function stopLive() {
		if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
		if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
		if (videoEl) videoEl.srcObject = null;
	}

	async function switchCamera(deviceId: string) {
		selectedDeviceId = deviceId;
		await startStream(deviceId);
	}

	function reset() {
		stopLive();
		mode = 'choose';
		errorMsg = '';
	}
</script>

<div class="space-y-4">

	{#if mode === 'choose'}
		<!-- ── Choose mode ─────────────────────────────────────────────────── -->
		<div class="space-y-3">
			<!-- Primary: native camera (opens camera app on mobile, file picker on desktop) -->
			<label class="flex w-full cursor-pointer flex-col items-center gap-3 rounded-2xl bg-gray-900 px-6 py-8 text-white transition-opacity hover:opacity-90 active:opacity-80">
				<Camera size={36} class="text-pink-400" />
				<div class="text-center">
					<p class="text-sm font-bold">Open Camera</p>
					<p class="mt-0.5 text-xs text-white/60">Take a photo of the QR code</p>
				</div>
				<input
					type="file"
					accept="image/*"
					capture="environment"
					class="hidden"
					onchange={handleNativeCapture}
				/>
			</label>

			<!-- Desktop live camera option -->
			{#if !isMobile}
				<button
					onclick={startLive}
					class="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 py-4 text-sm font-semibold text-gray-600 hover:border-pink-400 hover:text-pink-600 transition-colors"
				>
					<ScanLine size={18} /> Use Live Camera
				</button>
			{/if}

			<!-- Upload fallback -->
			<label class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-200 py-3 text-xs font-medium text-gray-500 hover:border-pink-400 hover:text-pink-600 transition-colors">
				<Upload size={14} /> Upload QR photo from gallery
				<input type="file" accept="image/*" class="hidden" onchange={handleFileUpload} />
			</label>
		</div>

	{:else if mode === 'processing'}
		<!-- ── Processing ──────────────────────────────────────────────────── -->
		<div class="flex flex-col items-center gap-3 py-10">
			<div class="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-pink-600"></div>
			<p class="text-sm text-gray-500">Reading QR code…</p>
		</div>

	{:else if mode === 'error'}
		<!-- ── Error ───────────────────────────────────────────────────────── -->
		<div class="flex flex-col items-center gap-4 py-4">
			<div class="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
				<span class="text-2xl">✕</span>
			</div>
			<p class="text-center text-sm text-gray-600">{errorMsg}</p>
			<button onclick={reset} class="w-full rounded-xl bg-pink-600 py-3 text-sm font-semibold text-white hover:bg-pink-700 transition-colors">
				Try Again
			</button>
		</div>

	{:else if mode === 'live'}
		<!-- ── Live camera (desktop) ───────────────────────────────────────── -->
		<div class="space-y-3">
			<!-- Camera selector -->
			{#if cameras.length > 1}
				<select
					value={selectedDeviceId}
					onchange={(e) => switchCamera((e.target as HTMLSelectElement).value)}
					class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 focus:border-pink-400 focus:outline-none"
				>
					{#each cameras as cam, i}
						<option value={cam.deviceId}>{cam.label || `Camera ${i + 1}`}</option>
					{/each}
				</select>
			{/if}

			<!-- Viewfinder -->
			<div class="relative overflow-hidden rounded-2xl bg-black" style="min-height:260px">
				<!-- svelte-ignore a11y_media_has_caption -->
				<video bind:this={videoEl} autoplay playsinline muted class="w-full rounded-2xl" style="max-height:300px;object-fit:cover"></video>
				<canvas bind:this={canvasEl} class="hidden"></canvas>
				<!-- Corner brackets -->
				<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
					<div class="relative h-52 w-52">
						<span class="absolute left-0 top-0 h-8 w-8 rounded-tl-lg border-l-4 border-t-4 border-pink-400"></span>
						<span class="absolute right-0 top-0 h-8 w-8 rounded-tr-lg border-r-4 border-t-4 border-pink-400"></span>
						<span class="absolute bottom-0 left-0 h-8 w-8 rounded-bl-lg border-b-4 border-l-4 border-pink-400"></span>
						<span class="absolute bottom-0 right-0 h-8 w-8 rounded-br-lg border-b-4 border-r-4 border-pink-400"></span>
						<span class="absolute inset-x-2 h-0.5 animate-[scan_2s_ease-in-out_infinite] bg-pink-400/80 shadow-[0_0_8px_2px_rgba(236,72,153,0.5)]"></span>
					</div>
				</div>
			</div>

			<p class="text-center text-xs text-gray-400">Align the QR code within the frame</p>

			<div class="flex gap-2">
				<button onclick={reset} class="flex-1 rounded-xl border border-gray-200 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
					← Back
				</button>
				<label class="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 py-2.5 text-xs font-medium text-gray-500 hover:border-pink-400 hover:text-pink-600 transition-colors">
					<Upload size={13} /> Upload instead
					<input type="file" accept="image/*" class="hidden" onchange={handleFileUpload} />
				</label>
			</div>
		</div>
	{/if}
</div>
