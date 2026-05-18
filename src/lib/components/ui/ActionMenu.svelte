<script lang="ts">
	import { EllipsisVertical } from 'lucide-svelte';
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';
	import type { ActionMenuItem } from './ActionMenu.types';
	export type { ActionMenuItem } from './ActionMenu.types';

	/**
	 * ActionMenu — reusable ellipsis (⋮) dropdown menu.
	 *
	 * The panel uses fixed positioning so it is never clipped by a parent's
	 * overflow:hidden or z-index stacking context (e.g. inside a modal).
	 * Position is computed from the trigger's bounding rect at open time,
	 * and the panel auto-flips upward when there is insufficient space below.
	 *
	 * Usage:
	 * ```svelte
	 * <ActionMenu
	 *   items={[
	 *     { label: 'Edit',    action: () => openEdit(item) },
	 *     { label: 'Archive', action: () => archive(item) },
	 *     { label: 'Delete',  action: () => del(item), variant: 'danger' }
	 *   ]}
	 * />
	 * ```
	 */

	interface Props {
		items: ActionMenuItem[];
		triggerLabel?: string;
		/** Which side of the trigger the panel aligns to (horizontal anchor when side='bottom') */
		align?: 'left' | 'right';
		/** Which side of the trigger the panel opens from */
		side?: 'bottom' | 'top' | 'left' | 'right';
	}

	let { items, triggerLabel = 'Open actions', align = 'right', side = 'bottom' }: Props = $props();

	let open = $state(false);
	let triggerEl = $state<HTMLButtonElement | null>(null);
	let panelEl = $state<HTMLDivElement | null>(null);
	let panelStyle = $state('');

	const PANEL_WIDTH = 220; // wider to fit icon + label comfortably
	const PANEL_ITEM_HEIGHT = 36;
	const PANEL_PADDING = 8;

	function computePosition() {
		if (!triggerEl || !browser) return;
		const rect = triggerEl.getBoundingClientRect();
		const estimatedHeight = items.length * PANEL_ITEM_HEIGHT + PANEL_PADDING * 2;

		let top: number;
		let left: number;

		if (side === 'top') {
			// Open above the trigger
			top = rect.top - estimatedHeight - 4;
			left = align === 'right'
				? Math.max(4, rect.right - PANEL_WIDTH)
				: Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 4);
		} else if (side === 'left') {
			// Open to the left of the trigger, vertically centered on it.
			// Auto-flip right if there's not enough space on the left.
			const spaceLeft = rect.left;
			const useLeft = spaceLeft >= PANEL_WIDTH + 8;
			left = useLeft
				? rect.left - PANEL_WIDTH - 4
				: rect.right + 4;
			// Align top of panel with top of trigger, clamp to viewport
			top = Math.min(
				Math.max(4, rect.top),
				window.innerHeight - estimatedHeight - 4
			);
		} else if (side === 'right') {
			// Open to the right of the trigger
			const spaceRight = window.innerWidth - rect.right;
			const useRight = spaceRight >= PANEL_WIDTH + 8;
			left = useRight
				? rect.right + 4
				: rect.left - PANEL_WIDTH - 4;
			top = Math.min(
				Math.max(4, rect.top),
				window.innerHeight - estimatedHeight - 4
			);
		} else {
			// Default: open below (or above if not enough space)
			const spaceBelow = window.innerHeight - rect.bottom;
			top = spaceBelow >= estimatedHeight
				? rect.bottom + 4
				: rect.top - estimatedHeight - 4;
			left = align === 'right'
				? Math.max(4, rect.right - PANEL_WIDTH)
				: Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 4);
		}

		panelStyle = `position:fixed;top:${top}px;left:${left}px;width:${PANEL_WIDTH}px;z-index:9999;`;
	}

	function toggle(e: MouseEvent) {
		e.stopPropagation();
		if (open) {
			open = false;
		} else {
			computePosition();
			open = true;
		}
	}

	function handlePointerDown(e: PointerEvent) {
		if (!open) return;
		const target = e.target as Node;
		// Ignore clicks on the trigger (toggle handles those) or inside the panel
		if (triggerEl?.contains(target) || panelEl?.contains(target)) return;
		open = false;
	}

	function close() {
		open = false;
	}

	function handleItemClick(e: MouseEvent, item: ActionMenuItem) {
		e.stopPropagation();
		if (item.disabled) return;
		close();
		item.action();
	}

	// Clean up on destroy — nothing to remove since we use svelte:document
	onDestroy(() => { open = false; });

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) {
					node.parentNode.removeChild(node);
				}
			}
		};
	}

	const variantCls: Record<NonNullable<ActionMenuItem['variant']>, string> = {
		default: 'text-gray-700 hover:bg-gray-50',
		danger:  'text-red-600  hover:bg-red-50',
		warning: 'text-amber-600 hover:bg-amber-50',
		success: 'text-emerald-600 hover:bg-emerald-50',
		purple:  'text-purple-700 hover:bg-purple-50'
	};

	const iconCls: Record<NonNullable<ActionMenuItem['variant']>, string> = {
		default: 'text-gray-400',
		danger:  'text-red-400',
		warning: 'text-amber-400',
		success: 'text-emerald-500',
		purple:  'text-purple-500'
	};
</script>

<svelte:document onpointerdown={handlePointerDown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="relative inline-block">
	<!-- Trigger -->
	<button
		bind:this={triggerEl}
		type="button"
		onclick={toggle}
		aria-haspopup="true"
		aria-expanded={open}
		aria-label={triggerLabel}
		class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1"
	>
		<EllipsisVertical size={18} aria-hidden="true" />
	</button>

	{#if open}
		<!--
			Panel uses fixed positioning with an inline style computed from the
			trigger's bounding rect. This escapes any parent overflow:hidden or
			stacking context — the same technique used by Floating UI / Popper.js.
		-->
		<div
			use:portal
			bind:this={panelEl}
			style={panelStyle}
			class="rounded-xl border border-gray-200 bg-white py-1 shadow-xl ring-1 ring-black/5"
			role="menu"
			tabindex="-1"
			aria-orientation="vertical"
		>
			{#each items as item}
				{#if item.divider}
					<div class="my-1 border-t border-gray-100" role="separator"></div>
				{/if}
				<button
					type="button"
					onclick={(e) => handleItemClick(e, item)}
					disabled={item.disabled}
					role="menuitem"
					class="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 {variantCls[item.variant ?? 'default']}"
				>
					{#if item.icon}
						<item.icon size={15} class="shrink-0 {iconCls[item.variant ?? 'default']}" aria-hidden="true" />
					{:else}
						<span class="w-[15px] shrink-0"></span>
					{/if}
					{item.label}
				</button>
			{/each}
		</div>
	{/if}
</div>
