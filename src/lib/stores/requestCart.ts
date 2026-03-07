import { derived, writable } from 'svelte/store';

export interface RequestCartItem {
	itemId: string;
	name: string;
	quantity: number;
	maxQuantity: number;
	categoryId?: string;
	picture?: string;
}

interface RequestCartState {
	items: RequestCartItem[];
}

type AddItemPayload = Omit<RequestCartItem, 'quantity'> & { quantity?: number };

type AddItemResult = 'added' | 'incremented' | 'capped';

const initialState: RequestCartState = {
	items: []
};

function createRequestCartStore() {
	const { subscribe, update, set } = writable<RequestCartState>(initialState);

	return {
		subscribe,

		addItem: (item: AddItemPayload): AddItemResult => {
			let result: AddItemResult = 'added';
			update((state) => {
				const nextItems = [...state.items];
				const index = nextItems.findIndex((entry) => entry.itemId === item.itemId);
				const maxQuantity = Math.max(1, item.maxQuantity);
				const incrementBy = Math.max(1, item.quantity ?? 1);

				if (index >= 0) {
					const current = nextItems[index];
					const nextQuantity = Math.min(current.quantity + incrementBy, maxQuantity);
					result = nextQuantity === current.quantity ? 'capped' : 'incremented';
					nextItems[index] = {
						...current,
						name: item.name,
						maxQuantity,
						categoryId: item.categoryId,
						picture: item.picture,
						quantity: nextQuantity
					};
					return { ...state, items: nextItems };
				}

				nextItems.push({
					itemId: item.itemId,
					name: item.name,
					quantity: Math.min(incrementBy, maxQuantity),
					maxQuantity,
					categoryId: item.categoryId,
					picture: item.picture
				});
				result = 'added';
				return { ...state, items: nextItems };
			});

			return result;
		},

		setQuantity: (itemId: string, quantity: number) => {
			update((state) => {
				const nextItems = state.items.map((item) => {
					if (item.itemId !== itemId) {
						return item;
					}

					return {
						...item,
						quantity: Math.max(1, Math.min(item.maxQuantity, quantity))
					};
				});

				return { ...state, items: nextItems };
			});
		},

		removeItem: (itemId: string) => {
			update((state) => ({
				...state,
				items: state.items.filter((item) => item.itemId !== itemId)
			}));
		},

		clear: () => set(initialState)
	};
}

export const requestCartStore = createRequestCartStore();

export const requestCartItems = derived(requestCartStore, ($store) => $store.items);

export const requestCartCount = derived(requestCartItems, ($items) =>
	$items.reduce((total, item) => total + item.quantity, 0)
);
