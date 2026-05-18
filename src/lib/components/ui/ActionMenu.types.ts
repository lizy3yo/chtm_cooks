// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LucideIcon = new (...args: any[]) => any;

export interface ActionMenuItem {
	label: string;
	action: () => void;
	variant?: 'default' | 'danger' | 'warning' | 'success' | 'purple';
	/** Lucide-svelte icon component */
	icon?: LucideIcon;
	/** Render a divider line above this item */
	divider?: boolean;
	disabled?: boolean;
}
