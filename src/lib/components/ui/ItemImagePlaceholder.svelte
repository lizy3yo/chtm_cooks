<!--
  ItemImagePlaceholder
  Shown whenever an inventory item has no uploaded picture.
  Uses lucide-svelte's Package2 icon — clean, professional, industry-standard.

  Props:
    size   — controls the icon size class (default: 'md')
    class  — additional classes forwarded to the wrapper
-->
<script lang="ts">
	import { Package2 } from 'lucide-svelte';

	interface Props {
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
		class?: string;
	}

	let { size = 'md', class: className = '' }: Props = $props();

	const sizeMap: Record<NonNullable<Props['size']>, { icon: number; wrapper: string }> = {
		xs: { icon: 14, wrapper: 'h-6 w-6' },
		sm: { icon: 18, wrapper: 'h-9 w-9' },
		md: { icon: 28, wrapper: 'h-full w-full' },
		lg: { icon: 40, wrapper: 'h-full w-full' },
		xl: { icon: 56, wrapper: 'h-full w-full' }
	};

	const cfg = $derived(sizeMap[size]);
</script>

<div
	class="flex items-center justify-center bg-gray-100 text-gray-400 {cfg.wrapper} {className}"
	aria-hidden="true"
>
	<Package2 size={cfg.icon} strokeWidth={1.5} />
</div>
