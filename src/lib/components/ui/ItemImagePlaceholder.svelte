<!--
  ItemImagePlaceholder
  Shown whenever an inventory item has no uploaded picture or when an image fails to load.
  Industry-standard placeholder: subtle gradient background, centered icon, clean and professional.

  Props:
    size   — controls the icon size class (default: 'md')
    class  — additional classes forwarded to the wrapper
-->
<script lang="ts">
	import { ImageOff } from 'lucide-svelte';

	interface Props {
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
		class?: string;
	}

	let { size = 'md', class: className = '' }: Props = $props();

	const sizeMap: Record<NonNullable<Props['size']>, { icon: number; wrapper: string }> = {
		xs: { icon: 10, wrapper: 'h-full w-full' },
		sm: { icon: 16, wrapper: 'h-full w-full' },
		md: { icon: 24, wrapper: 'h-full w-full' },
		lg: { icon: 36, wrapper: 'h-full w-full' },
		xl: { icon: 48, wrapper: 'h-full w-full' }
	};

	const cfg = $derived(sizeMap[size]);
</script>

<div
	class="flex items-center justify-center bg-linear-to-br from-gray-100 to-gray-200 text-gray-400 {cfg.wrapper} {className}"
	aria-label="No image available"
	role="img"
>
	<ImageOff size={cfg.icon} strokeWidth={1.5} class="opacity-50" />
</div>
