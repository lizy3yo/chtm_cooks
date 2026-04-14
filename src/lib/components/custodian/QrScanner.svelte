<script lang="ts">
	/**
	 * QrScanner — GCash-style: full-screen live camera viewfinder,
	 * auto-detects QR via jsQR frame scanning, Upload QR as fallback.
	 */
	import { onMount, onDestroy } from 'svelte';
	import { Upload } from 'lucide-svelte';

	interface Props {
		onResult: (rawId: string) => void;
	}

	let { onResult }: Props = $props();

	let videoEl: HTMLVideoElement | null = $state(null);
	let canvasEl: HTMLCanvasElement | null = $state(null);
	let stream: MediaStream | null = null;
	let rafId: number | null = null;
	let scanning = $state(true);
	let errorMsg = $state('');
	let cameras = $state<MediaDeviceInfo[]>([]);
	let selectedDeviceId = $state('');
	let scanSession = 0;
	let jsQrLoader: Promise<typeof import('jsqr')> | null = null;

	onMount(async () => {
		await startCamera();
	});

	onDestroy(() => {
		stop();
	});

	async function startCamera(deviceId?: string) {
		stop();
		scanSession += 1;
		scanning = true;
		errorMsg = '';

		try {
			if (!window.isSecureContext) {
				throw new Error('SECURE_CONTEXT_REQUIRED');
			}

			if (!navigator.mediaDevices?.getUserMedia) {
				throw new Error('MEDIA_DEVICES_UNAVAILABLE');
			}

			if (cameras.length === 0) {
				const all = await navigator.mediaDevices.enumerateDevices();
				cameras = all.filter((d) => d.kind === 'videoinput');
			}

			const rear = cameras.find((c) => /back|rear|environment|phone/i.test(c.label));
			selectedDeviceId = deviceId ?? selectedDeviceId ?? rear?.deviceId ?? cameras[cameras.length - 1]?.deviceId ?? '';

			const cameraAttempts: MediaStreamConstraints[] = [];
			if (selectedDeviceId) {
				cameraAttempts.push({
					video: {
						deviceId: { exact: selectedDeviceId },
						width: { ideal: 1280 },
						height: { ideal: 720 }
					}
				});
			}
			cameraAttempts.push({
				video: {
					facingMode: { ideal: 'environment' },
					width: { ideal: 1280 },
					height: { ideal: 720 }
				}
			});
			cameraAttempts.push({ video: true });

			let lastError: unknown = null;
			for (const constraints of cameraAttempts) {
				try {
					stream = await navigator.mediaDevices.getUserMedia(constraints);
					break;
				} catch (err) {
					lastError = err;
				}
			}

			if (!stream) {
				throw lastError ?? new Error('CAMERA_START_FAILED');
			}

			const all = await navigator.mediaDevices.enumerateDevices();
			cameras = all.filter((d) => d.kind === 'videoinput');
			if (!selectedDeviceId && cameras.length > 0) {
				const bestRear = cameras.find((c) => /back|rear|environment|phone/i.test(c.label));
				selectedDeviceId = bestRear?.deviceId ?? cameras[cameras.length - 1]?.deviceId ?? '';
			}

			if (!videoEl) return;
			videoEl.srcObject = stream;
			await videoEl.play();
			await tick(scanSession);
		} catch (err) {
			scanning = false;
			errorMsg = getCameraErrorMessage(err);
		}
	}

	async function tick(session: number) {
		if (!videoEl || !canvasEl || !scanning) return;
		const jsQR = await getJsQrDecoder();
		if (!jsQR) {
			scanning = false;
			errorMsg = 'Unable to load QR scanner. Use the photo upload instead.';
			return;
		}

		const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
		if (!ctx) return;

		const decoder = jsQR;

		function frame() {
			if (!videoEl || !canvasEl || !scanning || session !== scanSession) return;
			if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
				canvasEl.width  = videoEl.videoWidth;
				canvasEl.height = videoEl.videoHeight;
				ctx!.drawImage(videoEl, 0, 0);
				const data = ctx!.getImageData(0, 0, canvasEl.width, canvasEl.height);
				const result = decoder(data.data, data.width, data.height, { inversionAttempts: 'dontInvert' });
				if (result?.data) {
					stop();
					onResult(result.data);
					return;
				}
			}
			rafId = requestAnimationFrame(frame);
		}
		rafId = requestAnimationFrame(frame);
	}

	async function getJsQrDecoder() {
		if (!jsQrLoader) {
			jsQrLoader = import('jsqr');
		}

		try {
			const mod = await jsQrLoader;
			return mod.default;
		} catch {
			jsQrLoader = null;
			return null;
		}
	}

	function getCameraErrorMessage(error: unknown): string {
		if (error instanceof DOMException) {
			if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
				return 'Camera permission was denied or blocked. Enable camera access in browser/site settings, then try again.';
			}
			if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
				return 'No camera was detected on this device.';
			}
			if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
				return 'Camera is busy in another app. Close other camera apps and try again.';
			}
			if (error.name === 'OverconstrainedError') {
				return 'Selected camera is not available. Try switching camera or using upload.';
			}
		}

		if (error instanceof Error) {
			if (error.message === 'SECURE_CONTEXT_REQUIRED') {
				return 'Camera requires a secure connection (HTTPS).';
			}
			if (error.message === 'MEDIA_DEVICES_UNAVAILABLE') {
				return 'This browser does not support camera access.';
			}
		}

		return 'Could not start camera. Use the photo upload instead.';
	}

	function stop() {
		if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
		if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
		if (videoEl) videoEl.srcObject = null;
		scanning = false;
	}

	async function handleUpload(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		(e.target as HTMLInputElement).value = '';
		errorMsg = '';
		try {
			const jsQR = await getJsQrDecoder();
			if (!jsQR) {
				errorMsg = 'Unable to load QR scanner. Please try again.';
				return;
			}
			const bitmap = await createImageBitmap(file);
			const canvas = document.createElement('canvas');
			canvas.width = bitmap.width; canvas.height = bitmap.height;
			const ctx = canvas.getContext('2d')!;
			ctx.drawImage(bitmap, 0, 0);
			const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
			const result = jsQR ? jsQR(data.data, data.width, data.height) : null;
			if (result?.data) { onResult(result.data); }
			else { errorMsg = 'No QR code found. Try a clearer photo.'; }
		} catch {
			errorMsg = 'Could not read the image.';
		}
	}
</script>

<div class="flex flex-col gap-3">

	<!-- ── Viewfinder ──────────────────────────────────────────────────────── -->
	<div class="relative overflow-hidden rounded-2xl bg-black" style="aspect-ratio: 1 / 1; max-height: 320px;">

		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			bind:this={videoEl}
			autoplay
			playsinline
			muted
			class="absolute inset-0 h-full w-full object-cover"
		></video>

		<!-- Hidden canvas for frame decoding -->
		<canvas bind:this={canvasEl} class="hidden"></canvas>

		<!-- Dark vignette overlay -->
		<div class="pointer-events-none absolute inset-0"
			style="background: radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.55) 100%);">
		</div>

		<!-- Corner brackets (GCash-style blue) -->
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
			<div class="relative" style="width: 62%; aspect-ratio: 1 / 1;">
				<span class="absolute left-0 top-0 h-9 w-9 border-l-4 border-t-4 border-pink-500 rounded-tl-md"></span>
				<span class="absolute right-0 top-0 h-9 w-9 border-r-4 border-t-4 border-pink-500 rounded-tr-md"></span>
				<span class="absolute bottom-0 left-0 h-9 w-9 border-b-4 border-l-4 border-pink-500 rounded-bl-md"></span>
				<span class="absolute bottom-0 right-0 h-9 w-9 border-b-4 border-r-4 border-pink-500 rounded-br-md"></span>
				<!-- Scan line -->
				<span class="absolute inset-x-1 h-0.5 animate-[scan_2s_ease-in-out_infinite] bg-pink-400/90 shadow-[0_0_10px_3px_rgba(236,72,153,0.6)]"></span>
			</div>
		</div>

		<!-- Error state -->
		{#if errorMsg && !scanning}
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 px-6">
				<p class="text-center text-sm text-white/80">{errorMsg}</p>
				<button
					onclick={() => startCamera()}
					class="mt-2 rounded-xl bg-pink-600 px-5 py-2 text-sm font-semibold text-white hover:bg-pink-700 transition-colors"
				>
					Try Again
				</button>
			</div>
		{/if}

		<!-- Scanning hint -->
		{#if scanning}
			<p class="absolute bottom-3 inset-x-0 text-center text-xs text-white/60">
				Align QR code within the frame
			</p>
		{/if}
	</div>

	<!-- ── Camera selector ─────────────────────────────────────────────────── -->
	{#if cameras.length > 1}
		<select
			value={selectedDeviceId}
			onchange={(e) => startCamera((e.target as HTMLSelectElement).value)}
			class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 focus:border-pink-400 focus:outline-none"
		>
			{#each cameras as cam, i}
				<option value={cam.deviceId}>{cam.label || `Camera ${i + 1}`}</option>
			{/each}
		</select>
	{/if}

	<!-- ── Upload QR fallback ──────────────────────────────────────────────── -->
	<label class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 py-3 text-sm font-medium text-gray-500 hover:border-pink-400 hover:text-pink-600 transition-colors">
		<Upload size={16} />
		Upload QR
		<input type="file" accept="image/*" capture="environment" class="hidden" onchange={handleUpload} />
	</label>

</div>
