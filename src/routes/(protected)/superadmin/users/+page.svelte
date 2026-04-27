<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Search,
		Plus,
		Upload,
		Download,
		Info,
		Edit,
		Trash2,
		UserCheck,
		UserX,
		MoreVertical,
		X,
		RefreshCw,
		Eye,
		KeyRound,
		Wifi,
		WifiOff
	} from 'lucide-svelte';
	import {
		usersAPI,
		type UserResponse,
		type UserRole,
		type ProfilePhotoUpdatedEvent
	} from '$lib/api/users';
	import { toastStore } from '$lib/stores/toast';
	import { confirmStore } from '$lib/stores/confirm';

	type Tab = 'all' | 'create' | 'bulk-import' | 'inactive';

	// ─── Tab & UI state ─────────────────────────────────────────────────────────
	let activeTab = $state<Tab>('all');
	let sseConnected = $state(false);

	// ─── Users list state ────────────────────────────────────────────────────────
	let users = $state<UserResponse[]>([]);
	let pagination = $state({ page: 1, limit: 20, total: 0, totalPages: 1 });
	let loading = $state(false);
	let searchQuery = $state('');
	let selectedRole = $state<UserRole | 'all'>('all');
	let selectedStatus = $state<'all' | 'active' | 'inactive'>('all');
	let debounceTimer: ReturnType<typeof setTimeout>;

	// ─── Stats derived from full counts ─────────────────────────────────────────
	let stats = $state({
		total: 0,
		active: 0,
		inactive: 0,
		newThisMonth: 0,
		students: 0,
		instructors: 0,
		custodians: 0
	});

	// ─── Create user form ────────────────────────────────────────────────────────
	let createForm = $state({
		firstName: '',
		lastName: '',
		email: '',
		password: '',
		role: '' as UserRole | '',
		yearLevel: '',
		block: ''
	});
	let createLoading = $state(false);
	let createErrors = $state<Record<string, string>>({});

	// ─── Edit user modal ─────────────────────────────────────────────────────────
	let editUser = $state<UserResponse | null>(null);
	let editForm = $state({
		firstName: '',
		lastName: '',
		role: '' as UserRole,
		yearLevel: '',
		block: '',
		isActive: true
	});
	let editLoading = $state(false);

	// ─── Dropdown open tracking ──────────────────────────────────────────────────
	let openDropdown = $state<string | null>(null);

	// ─── Bulk import ─────────────────────────────────────────────────────────────
	let bulkFile = $state<File | null>(null);
	let bulkPreview = $state<Array<Record<string, string>>>([]);
	let bulkImporting = $state(false);
	let bulkProgress = $state(0);
	let bulkErrors = $state<string[]>([]);
	let isDragging = $state(false);

	// ─── SSE cleanup ─────────────────────────────────────────────────────────────
	let unsubscribeSSE: (() => void) | null = null;

	// ─── Per-user realtime photo overrides ──────────────────────────────────────
	// Keyed by userId; value is the fresh photoUrl received via SSE.
	// This lets us patch individual avatars in-place without re-fetching the
	// whole page — a pattern used by platforms like Twitter and LinkedIn.
	let photoOverrides = $state<Map<string, string | null>>(new Map());

	let _pollInterval: ReturnType<typeof setInterval> | null = null;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;

	function hydrateFromCache(): boolean {
		const role = selectedRole !== 'all' ? selectedRole : undefined;
		const cached = usersAPI.peekCachedUsers({
			role,
			search: searchQuery || undefined,
			page: pagination.page,
			limit: pagination.limit
		});
		if (!cached) return false;

		let list = cached.users;
		if (selectedStatus === 'active') list = list.filter((u) => u.isActive);
		if (selectedStatus === 'inactive') list = list.filter((u) => !u.isActive);
		users = list;
		pagination = cached.pagination;
		loading = false;
		return true;
	}

	function scheduleRefresh(forceRefresh = false): void {
		if (refreshTimer !== null) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			void loadUsers(false, forceRefresh);
			void loadStats(forceRefresh);
		}, 250);
	}

	// ─── Lifecycle ───────────────────────────────────────────────────────────────
	onMount(() => {
		hydrateFromCache();
		void loadUsers(users.length === 0, false);
		void loadStats(false);

		unsubscribeSSE = usersAPI.subscribeToChanges(
			// ── CRUD events (create / update / delete) ─────────────────────────
			(event) => {
				sseConnected = true;
				scheduleRefresh(true);
				const msgs: Record<string, string> = {
					user_created: 'A new user was added',
					user_updated: 'A user was updated',
					user_deleted: 'A user was removed'
				};
				toastStore.info(msgs[event.action] || 'User list updated', 'Live Update');
			},
			// ── Profile photo events (in-place avatar patch) ────────────────────
			async (event: ProfilePhotoUpdatedEvent) => {
				await patchUserPhoto(event.userId);
			}
		);
		setTimeout(() => {
			sseConnected = true;
		}, 1500);

		// --- 30-second polling fallback ---
		_pollInterval = setInterval(() => {
			void loadUsers(false, true);
			void loadStats(true);
		}, 30_000);

		// --- Refresh on tab/window focus ---
		const onFocus = () => { void loadUsers(false, true); void loadStats(true); };
		const onVisible = () => { if (document.visibilityState === 'visible') { void loadUsers(false, true); void loadStats(true); } };
		window.addEventListener('focus', onFocus);
		document.addEventListener('visibilitychange', onVisible);

		return () => {
			unsubscribeSSE?.();
			if (_pollInterval !== null) clearInterval(_pollInterval);
			if (refreshTimer !== null) clearTimeout(refreshTimer);
			window.removeEventListener('focus', onFocus);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	// ─── Data loading ─────────────────────────────────────────────────────────────
	async function loadUsers(showLoader = true, forceRefresh = true) {
		if (showLoader && users.length === 0) loading = true;
		try {
			const role = selectedRole !== 'all' ? selectedRole : undefined;
			const res = await usersAPI.getAll({
				role,
				search: searchQuery || undefined,
				page: pagination.page,
				limit: pagination.limit,
				forceRefresh
			});
			let list = res.users;
			if (selectedStatus === 'active') list = list.filter((u) => u.isActive);
			if (selectedStatus === 'inactive') list = list.filter((u) => !u.isActive);
			users = list;
			pagination = res.pagination;
			// Clear stale photo overrides for users no longer in view
			const activeIds = new Set(list.map((u) => u.id));
			for (const id of photoOverrides.keys()) {
				if (!activeIds.has(id)) photoOverrides.delete(id);
			}
			photoOverrides = new Map(photoOverrides); // trigger reactivity
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to load users');
		} finally {
			loading = false;
		}
	}

	/**
	 * Fetch the latest profilePhotoUrl for one user via API and store it in the
	 * override map, so the avatar refreshes in-place without a full table reload.
	 */
	async function patchUserPhoto(userId: string): Promise<void> {
		try {
			const freshUser = await usersAPI.getById(userId, true);
			photoOverrides = new Map(photoOverrides.set(userId, freshUser.profilePhotoUrl ?? null));
		} catch {
			// Silently fall back — the next full reload will catch up
		}
	}

	/**
	 * Returns the URL to display for a user's avatar.
	 * Priority: SSE-patched override → value from the paginated list → null
	 */
	function getAvatarUrl(u: UserResponse): string | null {
		if (photoOverrides.has(u.id)) return photoOverrides.get(u.id) ?? null;
		return u.profilePhotoUrl ?? null;
	}

	async function loadStats(forceRefresh = true) {
		try {
			const [all, students, instructors, custodians] = await Promise.all([
				usersAPI.getAll({ limit: 1, forceRefresh }),
				usersAPI.getAll({ role: 'student', limit: 1, forceRefresh }),
				usersAPI.getAll({ role: 'instructor', limit: 1, forceRefresh }),
				usersAPI.getAll({ role: 'custodian', limit: 1, forceRefresh })
			]);
			const allRes = await usersAPI.getAll({ limit: 1000, forceRefresh });
			const now = new Date();
			const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
			stats = {
				total: all.pagination.total,
				active: allRes.users.filter((u) => u.isActive).length,
				inactive: allRes.users.filter((u) => !u.isActive).length,
				newThisMonth: allRes.users.filter((u) => new Date(u.createdAt) >= monthStart).length,
				students: students.pagination.total,
				instructors: instructors.pagination.total,
				custodians: custodians.pagination.total
			};
		} catch {
			/* silent */
		}
	}

	// ─── Search debounce ─────────────────────────────────────────────────────────
	function onSearchInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			pagination.page = 1;
			loadUsers();
		}, 300);
	}

	function onFilterChange() {
		pagination.page = 1;
		loadUsers();
	}

	// ─── CRUD actions ─────────────────────────────────────────────────────────────
	function validateCreate(): boolean {
		const errs: Record<string, string> = {};
		if (!createForm.firstName.trim()) errs.firstName = 'Required';
		if (!createForm.lastName.trim()) errs.lastName = 'Required';
		if (!createForm.email.trim()) errs.email = 'Required';
		else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email)) errs.email = 'Invalid email';
		if (!createForm.password) errs.password = 'Required';
		else if (createForm.password.length < 8) errs.password = 'Minimum 8 characters';
		if (!createForm.role) errs.role = 'Required';
		if (createForm.role === 'student' && !createForm.yearLevel)
			errs.yearLevel = 'Required for students';
		if (createForm.role === 'student' && !createForm.block) errs.block = 'Required for students';
		createErrors = errs;
		return Object.keys(errs).length === 0;
	}

	async function handleCreateUser() {
		if (!validateCreate()) return;
		createLoading = true;
		try {
			await usersAPI.create({
				firstName: createForm.firstName.trim(),
				lastName: createForm.lastName.trim(),
				email: createForm.email.trim().toLowerCase(),
				password: createForm.password,
				role: createForm.role as UserRole,
				yearLevel: createForm.role === 'student' ? createForm.yearLevel : undefined,
				block: createForm.role === 'student' ? createForm.block : undefined
			});
			toastStore.success(
				`${createForm.firstName} ${createForm.lastName} created successfully`,
				'User Created'
			);
			createForm = {
				firstName: '',
				lastName: '',
				email: '',
				password: '',
				role: '',
				yearLevel: '',
				block: ''
			};
			createErrors = {};
			activeTab = 'all';
			await loadUsers();
			await loadStats();
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to create user', 'Error');
		} finally {
			createLoading = false;
		}
	}

	function openEdit(user: UserResponse) {
		editUser = user;
		editForm = {
			firstName: user.firstName,
			lastName: user.lastName,
			role: user.role,
			yearLevel: user.yearLevel || '',
			block: user.block || '',
			isActive: user.isActive
		};
		openDropdown = null;
	}

	async function handleEditUser() {
		if (!editUser) return;
		editLoading = true;
		try {
			await usersAPI.update(editUser.id, {
				firstName: editForm.firstName.trim(),
				lastName: editForm.lastName.trim(),
				role: editForm.role,
				isActive: editForm.isActive,
				yearLevel: editForm.role === 'student' ? editForm.yearLevel : undefined,
				block: editForm.role === 'student' ? editForm.block : undefined
			});
			toastStore.success('User updated successfully', 'Saved');
			editUser = null;
			await loadUsers();
			await loadStats();
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to update user', 'Error');
		} finally {
			editLoading = false;
		}
	}

	async function handleToggleActive(user: UserResponse) {
		openDropdown = null;
		const action = user.isActive ? 'deactivate' : 'reactivate';
		const confirmed = await confirmStore.confirm({
			type: user.isActive ? 'warning' : 'info',
			title: user.isActive ? 'Deactivate User' : 'Reactivate User',
			message: `Are you sure you want to ${action} ${user.firstName} ${user.lastName}? ${user.isActive ? 'They will lose access immediately.' : 'They will regain access to the system.'}`,
			confirmText: user.isActive ? 'Deactivate' : 'Reactivate'
		});
		if (!confirmed) return;
		try {
			await usersAPI.update(user.id, { isActive: !user.isActive });
			toastStore.success(
				`${user.firstName} ${user.isActive ? 'deactivated' : 'reactivated'} successfully`
			);
			await loadUsers();
			await loadStats();
		} catch (e: any) {
			toastStore.error(e.message || `Failed to ${action} user`);
		}
	}

	async function handleDelete(user: UserResponse) {
		openDropdown = null;
		const confirmed = await confirmStore.danger(
			`Are you sure you want to permanently delete ${user.firstName} ${user.lastName} (${user.email})? This action cannot be undone.`,
			'Delete User',
			'Delete Permanently'
		);
		if (!confirmed) return;
		try {
			await usersAPI.delete(user.id);
			toastStore.success(`${user.firstName} ${user.lastName} deleted`, 'User Deleted');
			await loadUsers();
			await loadStats();
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to delete user');
		}
	}

	async function handleResetPassword(user: UserResponse) {
		openDropdown = null;
		const confirmed = await confirmStore.confirm({
			type: 'warning',
			title: 'Reset Password',
			message: `Send a password reset link to ${user.email}?`,
			confirmText: 'Send Reset Link'
		});
		if (!confirmed) return;
		toastStore.info(`Password reset link sent to ${user.email}`, 'Reset Sent');
	}

	// ─── Bulk import ─────────────────────────────────────────────────────────────
	function parseCsvLine(line: string): string[] {
		const result: string[] = [];
		let current = '';
		let inQuotes = false;
		for (const ch of line) {
			if (ch === '"') {
				inQuotes = !inQuotes;
			} else if (ch === ',' && !inQuotes) {
				result.push(current.trim());
				current = '';
			} else {
				current += ch;
			}
		}
		result.push(current.trim());
		return result;
	}

	function handleFileSelect(file: File) {
		bulkFile = file;
		bulkPreview = [];
		bulkErrors = [];
		const reader = new FileReader();
		reader.onload = (e) => {
			const text = (e.target?.result as string) || '';
			const lines = text.split(/\r?\n/).filter((l) => l.trim());
			if (lines.length < 2) {
				bulkErrors = ['File must have a header row and at least one data row.'];
				return;
			}
			const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s/g, '_'));
			const rows: Array<Record<string, string>> = [];
			const errs: string[] = [];
			for (let i = 1; i < lines.length; i++) {
				const vals = parseCsvLine(lines[i]);
				if (vals.length < headers.length) {
					errs.push(`Row ${i + 1}: insufficient columns`);
					continue;
				}
				const row: Record<string, string> = {};
				headers.forEach((h, idx) => {
					row[h] = vals[idx] || '';
				});
				if (!row.email) {
					errs.push(`Row ${i + 1}: email is required`);
					continue;
				}
				if (!row.first_name) {
					errs.push(`Row ${i + 1}: first_name is required`);
					continue;
				}
				if (!row.last_name) {
					errs.push(`Row ${i + 1}: last_name is required`);
					continue;
				}
				rows.push(row);
			}
			bulkPreview = rows;
			bulkErrors = errs;
		};
		reader.readAsText(file);
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		const file = e.dataTransfer?.files[0];
		if (file) handleFileSelect(file);
	}

	function downloadTemplate() {
		const csv =
			'first_name,last_name,email,password,role,year_level,block\nJuan,dela Cruz,juan@example.com,Password123!,student,3rd Year,A\nMaria,Santos,maria@example.com,Password123!,instructor,,';
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'user_import_template.csv';
		a.click();
		URL.revokeObjectURL(url);
	}

	async function handleBulkImport() {
		if (!bulkPreview.length) return;
		bulkImporting = true;
		bulkProgress = 0;
		const errors: string[] = [];
		for (let i = 0; i < bulkPreview.length; i++) {
			const row = bulkPreview[i];
			try {
				await usersAPI.create({
					firstName: row.first_name,
					lastName: row.last_name,
					email: row.email.toLowerCase(),
					password: row.password || 'TempPass123!',
					role: (row.role as UserRole) || 'student',
					yearLevel: row.year_level || undefined,
					block: row.block || undefined
				});
			} catch (e: any) {
				errors.push(`Row ${i + 2}: ${e.message}`);
			}
			bulkProgress = Math.round(((i + 1) / bulkPreview.length) * 100);
		}
		bulkImporting = false;
		if (errors.length) {
			bulkErrors = [...bulkErrors, ...errors];
			toastStore.warning(`Import complete with ${errors.length} error(s).`, 'Partial Import');
		} else {
			toastStore.success(`Successfully imported ${bulkPreview.length} users.`, 'Import Complete');
		}
		bulkFile = null;
		bulkPreview = [];
		await loadUsers();
		await loadStats();
	}

	// ─── Helpers ──────────────────────────────────────────────────────────────────
	function roleBadge(role: string) {
		const map: Record<string, string> = {
			student: 'bg-blue-100 text-blue-800 border border-blue-200',
			instructor: 'bg-violet-100 text-violet-800 border border-violet-200',
			custodian: 'bg-pink-100 text-pink-800 border border-pink-200',
			superadmin: 'bg-gray-900 text-white border border-gray-700'
		};
		return map[role] || 'bg-gray-100 text-gray-700';
	}

	function statusBadge(active: boolean) {
		return active
			? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
			: 'bg-gray-100 text-gray-500 border border-gray-200';
	}

	function avatar(u: UserResponse) {
		return `${u.firstName[0] || ''}${u.lastName[0] || ''}`.toUpperCase();
	}

	function avatarColor(role: string) {
		const map: Record<string, string> = {
			student: 'from-blue-500 to-blue-700',
			instructor: 'from-violet-500 to-violet-700',
			custodian: 'from-pink-500 to-rose-600',
			superadmin: 'from-gray-700 to-gray-900'
		};
		return map[role] || 'from-gray-400 to-gray-600';
	}

	function formatDate(d: string | Date | undefined) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-PH', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function timeAgo(d: string | Date | undefined) {
		if (!d) return '—';
		const diff = Date.now() - new Date(d).getTime();
		const m = Math.floor(diff / 60000);
		if (m < 1) return 'Just now';
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		return `${Math.floor(h / 24)}d ago`;
	}

	const inputCls =
		'mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20 transition';
	const errorCls = 'mt-1 text-xs text-red-600';
</script>

<!-- ─── Edit User Slide-Over ─────────────────────────────────────────────────── -->
{#if editUser}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
		onclick={() => (editUser = null)}
		role="presentation"
	></div>
	<div
		class="fixed top-0 right-0 z-50 flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-md"
		role="dialog"
		aria-modal="true"
		aria-labelledby="edit-user-title"
	>
		<div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
			<div>
				<h2 id="edit-user-title" class="text-lg font-semibold text-gray-900">Edit User</h2>
				<p class="text-xs text-gray-500">{editUser.email}</p>
			</div>
			<button
				type="button"
				onclick={() => (editUser = null)}
				class="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
				aria-label="Close edit user dialog"
			>
				<X size={20} />
			</button>
		</div>
		<div class="flex-1 space-y-4 overflow-y-auto px-6 py-6">
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label for="edit-first-name" class="block text-sm font-medium text-gray-700"
						>First Name</label
					>
					<input
						id="edit-first-name"
						type="text"
						bind:value={editForm.firstName}
						class={inputCls}
					/>
				</div>
				<div>
					<label for="edit-last-name" class="block text-sm font-medium text-gray-700"
						>Last Name</label
					>
					<input id="edit-last-name" type="text" bind:value={editForm.lastName} class={inputCls} />
				</div>
			</div>
			<div>
				<label for="edit-role" class="block text-sm font-medium text-gray-700">Role</label>
				<select id="edit-role" bind:value={editForm.role} class={inputCls}>
					<option value="student">Student</option>
					<option value="instructor">Instructor</option>
					<option value="custodian">Custodian</option>
					<option value="superadmin">Superadmin</option>
				</select>
			</div>
			{#if editForm.role === 'student'}
				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label for="edit-year-level" class="block text-sm font-medium text-gray-700"
							>Year Level</label
						>
						<select id="edit-year-level" bind:value={editForm.yearLevel} class={inputCls}>
							<option value="">Select...</option>
							<option>1st Year</option><option>2nd Year</option><option>3rd Year</option><option
								>4th Year</option
							>
						</select>
					</div>
					<div>
						<label for="edit-block" class="block text-sm font-medium text-gray-700">Block</label>
						<select id="edit-block" bind:value={editForm.block} class={inputCls}>
							<option value="">Select...</option>
							<option>A</option><option>B</option><option>C</option><option>D</option>
						</select>
					</div>
				</div>
			{/if}
			<div
				class="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4"
			>
				<div>
					<p class="text-sm font-medium text-gray-900">Account Status</p>
					<p class="text-xs text-gray-500">
						{editForm.isActive ? 'User can access the system' : 'User is blocked from logging in'}
					</p>
				</div>
				<button
					type="button"
					onclick={() => (editForm.isActive = !editForm.isActive)}
					class="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 focus:outline-none {editForm.isActive
						? 'bg-emerald-500'
						: 'bg-gray-300'}"
					role="switch"
					aria-checked={editForm.isActive}
					aria-label="Toggle account status"
				>
					<span class="sr-only">{editForm.isActive ? 'Deactivate' : 'Activate'} account</span>
					<span
						class="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 {editForm.isActive
							? 'translate-x-5'
							: 'translate-x-0'}"
					></span>
				</button>
			</div>
		</div>
		<div class="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
			<button
				type="button"
				onclick={() => (editUser = null)}
				class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
				>Cancel</button
			>
			<button
				type="button"
				onclick={handleEditUser}
				disabled={editLoading}
				class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-pink-700 disabled:opacity-60"
			>
				{#if editLoading}<RefreshCw size={16} class="animate-spin" aria-hidden="true" />{/if}
				Save Changes
			</button>
		</div>
	</div>
{/if}

<!-- ─── Main Page ─────────────────────────────────────────────────────────────── -->
<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">User Management</h1>
			<p class="mt-0.5 text-sm text-gray-500">
				Manage all users across the system with role-based access control
			</p>
		</div>
			<div
				class="flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium {sseConnected
					? 'border-emerald-200 bg-emerald-50 text-emerald-700'
					: 'border-gray-200 bg-gray-50 text-gray-500'}"
			>
				{#if sseConnected}<Wifi
						size={13}
						class="text-emerald-500"
						aria-hidden="true"
					/>Live{:else}<WifiOff size={13} aria-hidden="true" />Connecting...{/if}
			</div>
		</div>

	<!-- Tabs -->
	<div class="border-b border-gray-200">
		<div class="-mb-px flex gap-1" role="tablist" aria-label="User management tabs">
			{#each [['all', 'All Users'], ['create', 'Create User'], ['bulk-import', 'Bulk Import'], ['inactive', 'Inactive Users']] as [tab, label]}
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === tab}
					aria-controls="{tab}-panel"
					onclick={() => {
						activeTab = tab as Tab;
						if (tab === 'all' || tab === 'inactive') loadUsers();
					}}
					class="border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors {activeTab ===
					tab
						? 'border-pink-600 text-pink-600'
						: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
					>{label}</button
				>
			{/each}
		</div>
	</div>

	<!-- ── ALL USERS TAB ─────────────────────────────────────────────────────── -->
	{#if activeTab === 'all' || activeTab === 'inactive'}
		<div role="tabpanel" id="{activeTab}-panel" aria-labelledby="{activeTab}-tab">
			<!-- Stats -->
			{#if activeTab === 'all'}
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{#if loading && stats.total === 0}
						{#each Array(4) as _}
							<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
								<div class="animate-pulse space-y-3">
									<div class="h-4 w-24 rounded bg-gray-200"></div>
									<div class="h-9 w-16 rounded bg-gray-200"></div>
									<div class="h-3 w-32 rounded bg-gray-200"></div>
								</div>
							</div>
						{/each}
					{:else}
					<div
						class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
					>
						<p class="text-sm font-medium text-gray-500">Total Users</p>
						<p class="mt-2 text-3xl font-bold text-gray-900">{stats.total.toLocaleString()}</p>
						<p class="mt-1 text-xs text-gray-400">All roles combined</p>
					</div>
					<div
						class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
					>
						<p class="text-sm font-medium text-gray-500">Active Users</p>
						<p class="mt-2 text-3xl font-bold text-emerald-600">{stats.active.toLocaleString()}</p>
						<p class="mt-1 text-xs text-gray-400">
							{stats.total ? ((stats.active / stats.total) * 100).toFixed(1) : 0}% of total
						</p>
					</div>
					<div
						class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
					>
						<p class="text-sm font-medium text-gray-500">Inactive Users</p>
						<p class="mt-2 text-3xl font-bold text-gray-600">{stats.inactive.toLocaleString()}</p>
						<p class="mt-1 text-xs text-amber-600">Require attention</p>
					</div>
					<div
						class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
					>
						<p class="text-sm font-medium text-gray-500">New This Month</p>
						<p class="mt-2 text-3xl font-bold text-pink-600">
							{stats.newThisMonth.toLocaleString()}
						</p>
						<p class="mt-1 text-xs text-gray-400">Registered this month</p>
					</div>
					{/if}
				</div>
			{/if}

			<!-- Role distribution pills -->
			{#if activeTab === 'all'}
				<div class="flex flex-wrap gap-2">
					<span
						class="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
						>Students <span class="font-bold">{stats.students}</span></span
					>
					<span
						class="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700"
						>Instructors <span class="font-bold">{stats.instructors}</span></span
					>
					<span
						class="inline-flex items-center gap-1.5 rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-700"
						>Custodians <span class="font-bold">{stats.custodians}</span></span
					>
				</div>
			{/if}

			<!-- Filters -->
			<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
					<div class="relative flex-1">
						<Search
							size={16}
							class="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
							aria-hidden="true"
						/>
						<input
							type="text"
							bind:value={searchQuery}
							oninput={onSearchInput}
							placeholder="Search by name or email…"
							class="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-9 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
							aria-label="Search users by name or email"
						/>
					</div>
					<select
						bind:value={selectedRole}
						onchange={onFilterChange}
						class="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
						aria-label="Filter by role"
					>
						<option value="all">All Roles</option>
						<option value="student">Student</option>
						<option value="instructor">Instructor</option>
						<option value="custodian">Custodian</option>
						<option value="superadmin">Superadmin</option>
					</select>
					{#if activeTab === 'all'}
						<select
							bind:value={selectedStatus}
							onchange={onFilterChange}
							class="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
							aria-label="Filter by status"
						>
							<option value="all">All Status</option>
							<option value="active">Active</option>
							<option value="inactive">Inactive</option>
						</select>
					{/if}
					<div class="flex gap-2">
						<button
							type="button"
							onclick={() => {
								bulkFile = null;
								bulkPreview = [];
								bulkErrors = [];
								activeTab = 'bulk-import';
							}}
							class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
							aria-label="Import users"
						>
							<Upload size={16} aria-hidden="true" />Import
						</button>
						<button
							type="button"
							onclick={() => (activeTab = 'create')}
							class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-pink-700"
							aria-label="Add new user"
						>
							<Plus size={16} aria-hidden="true" />Add User
						</button>
					</div>
				</div>
			</div>

			<!-- Table -->
			<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
				{#if loading && users.length === 0}
					<div class="p-6">
						<div class="animate-pulse space-y-4">
							<!-- Table Header Skeleton -->
							<div class="hidden gap-4 border-b border-gray-200 pb-4 md:flex">
								<div class="h-4 w-1/4 rounded bg-gray-200"></div>
								<div class="h-4 w-1/6 rounded bg-gray-200"></div>
								<div class="h-4 w-1/6 rounded bg-gray-200"></div>
								<div class="h-4 w-1/6 rounded bg-gray-200"></div>
								<div class="h-4 w-1/6 rounded bg-gray-200"></div>
								<div class="h-4 w-1/12 rounded bg-gray-200"></div>
							</div>
							<!-- Rows Skeleton -->
							{#each Array(6) as _}
								<div
									class="flex flex-col gap-4 border-b border-gray-100 py-3 last:border-0 md:flex-row md:items-center"
								>
									<div class="flex items-center gap-3 md:w-1/4">
										<div class="h-10 w-10 shrink-0 rounded-full bg-gray-200"></div>
										<div class="space-y-2">
											<div class="h-4 w-24 rounded bg-gray-200"></div>
											<div class="h-3 w-32 rounded bg-gray-200"></div>
										</div>
									</div>
									<div class="hidden md:block md:w-1/6">
										<div class="h-6 w-20 rounded-full bg-gray-200"></div>
									</div>
									<div class="hidden md:block md:w-1/6">
										<div class="h-6 w-16 rounded-full bg-gray-200"></div>
									</div>
									<div class="hidden md:block md:w-1/6">
										<div class="h-4 w-28 rounded bg-gray-200"></div>
									</div>
									<div class="hidden md:block md:w-1/6">
										<div class="h-4 w-20 rounded bg-gray-200"></div>
									</div>
									<div class="hidden justify-end md:flex md:w-1/12">
										<div class="h-8 w-8 rounded-lg bg-gray-200"></div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{:else if users.length === 0}
					<div class="flex flex-col items-center justify-center py-16 text-center">
						<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
							<Search size={28} class="text-gray-400" aria-hidden="true" />
						</div>
						<p class="text-base font-semibold text-gray-900">No users found</p>
						<p class="mt-1 text-sm text-gray-500">Try adjusting your search or filters</p>
					</div>
				{:else}
					<!-- Desktop table -->
					<div class="hidden overflow-x-auto md:block">
						<table class="w-full">
							<thead class="border-b border-gray-200 bg-gray-50">
								<tr>
									<th
										class="px-6 py-3 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>User</th
									>
									<th
										class="px-6 py-3 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Role</th
									>
									<th
										class="px-6 py-3 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Status</th
									>
									<th
										class="px-6 py-3 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Class Info</th
									>
									<th
										class="px-6 py-3 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Last Login</th
									>
									<th
										class="px-6 py-3 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Joined</th
									>
									<th
										class="px-6 py-3 text-right text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Actions</th
									>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100">
								{#each users as user (user.id)}
									<tr class="group transition-colors hover:bg-gray-50">
										<td class="px-6 py-4">
											<div class="flex items-center gap-3">
												<!-- Smart avatar: photo → initials fallback -->
												<div class="relative h-10 w-10 shrink-0">
													{#if getAvatarUrl(user)}
														<img
															src={getAvatarUrl(user)}
															alt="{user.firstName} {user.lastName}"
															class="h-10 w-10 rounded-full object-cover shadow-sm ring-2 ring-white transition-opacity duration-300"
															onerror={(e) => {
																// If Cloudinary URL fails, remove override so initials show
																(e.currentTarget as HTMLImageElement).style.display = 'none';
																photoOverrides = new Map(photoOverrides.set(user.id, null));
															}}
														/>
													{:else}
														<div
															class="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br {avatarColor(
																user.role
															)} text-sm font-bold text-white shadow-sm"
														>
															{avatar(user)}
														</div>
													{/if}
												</div>
												<div class="min-w-0">
													<p class="truncate font-semibold text-gray-900">
														{user.firstName}
														{user.lastName}
													</p>
													<p class="truncate text-xs text-gray-500">{user.email}</p>
												</div>
											</div>
										</td>
										<td class="px-6 py-4">
											<span
												class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold {roleBadge(
													user.role
												)}"
											>
												{user.role.charAt(0).toUpperCase() + user.role.slice(1)}
											</span>
										</td>
										<td class="px-6 py-4">
											<span
												class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold {statusBadge(
													user.isActive
												)}"
											>
												{user.isActive ? 'Active' : 'Inactive'}
											</span>
										</td>
										<td class="px-6 py-4 text-sm text-gray-600">
											{#if user.yearLevel && user.block}
												<span class="font-medium">{user.yearLevel}</span> · Block {user.block}
											{:else}
												<span class="text-gray-400">—</span>
											{/if}
										</td>
										<td class="px-6 py-4 text-sm text-gray-500">{timeAgo(user.lastLogin)}</td>
										<td class="px-6 py-4 text-sm text-gray-500">{formatDate(user.createdAt)}</td>
										<td class="px-6 py-4 text-right">
											<div class="relative inline-block">
												<button
													type="button"
													onclick={(e) => {
														e.stopPropagation();
														openDropdown = openDropdown === user.id ? null : user.id;
													}}
													class="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
													aria-label="User actions for {user.firstName} {user.lastName}"
													aria-expanded={openDropdown === user.id}
													aria-haspopup="menu"
												>
													<MoreVertical size={18} aria-hidden="true" />
												</button>
												{#if openDropdown === user.id}
													<!-- svelte-ignore a11y_no_static_element_interactions -->
													<!-- svelte-ignore a11y_click_events_have_key_events -->
													<div
														class="absolute top-10 right-0 z-30 w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-xl"
														onclick={(e) => e.stopPropagation()}
														role="menu"
														aria-label="User actions menu"
														tabindex="-1"
													>
														<button
															type="button"
															onclick={() => openEdit(user)}
															class="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50"
															role="menuitem"
														>
															<Edit size={15} class="text-gray-400" aria-hidden="true" />Edit User
														</button>
														<button
															type="button"
															onclick={() => handleResetPassword(user)}
															class="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50"
															role="menuitem"
														>
															<KeyRound size={15} class="text-gray-400" aria-hidden="true" />Reset
															Password
														</button>
														<div class="my-1 border-t border-gray-100" role="separator"></div>
														<button
															type="button"
															onclick={() => handleToggleActive(user)}
															class="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm transition hover:bg-gray-50 {user.isActive
																? 'text-amber-700'
																: 'text-emerald-700'}"
															role="menuitem"
														>
															{#if user.isActive}<UserX
																	size={15}
																	class="text-amber-500"
																	aria-hidden="true"
																/>Deactivate{:else}<UserCheck
																	size={15}
																	class="text-emerald-500"
																	aria-hidden="true"
																/>Reactivate{/if}
														</button>
														<button
															type="button"
															onclick={() => handleDelete(user)}
															class="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 transition hover:bg-red-50"
															role="menuitem"
														>
															<Trash2 size={15} class="text-red-500" aria-hidden="true" />Delete
															User
														</button>
													</div>
												{/if}
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<!-- Mobile cards -->
					<div class="divide-y divide-gray-100 md:hidden">
						{#each users as user (user.id)}
							<div class="p-4 transition-colors hover:bg-gray-50">
								<div class="flex items-center justify-between gap-3">
									<div class="flex min-w-0 items-center gap-3">
										<!-- Smart avatar: photo → initials fallback -->
										<div class="relative h-10 w-10 shrink-0">
											{#if getAvatarUrl(user)}
												<img
													src={getAvatarUrl(user)}
													alt="{user.firstName} {user.lastName}"
													class="h-10 w-10 rounded-full object-cover shadow-sm ring-2 ring-white transition-opacity duration-300"
													onerror={(e) => {
														(e.currentTarget as HTMLImageElement).style.display = 'none';
														photoOverrides = new Map(photoOverrides.set(user.id, null));
													}}
												/>
											{:else}
												<div
													class="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br {avatarColor(
														user.role
													)} text-sm font-bold text-white"
												>
													{avatar(user)}
												</div>
											{/if}
										</div>
										<div class="min-w-0">
											<p class="truncate text-sm font-semibold text-gray-900">
												{user.firstName}
												{user.lastName}
											</p>
											<p class="truncate text-xs text-gray-500">{user.email}</p>
										</div>
									</div>
									<div class="flex shrink-0 items-center gap-2">
										<span
											class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold {roleBadge(
												user.role
											)}">{user.role.charAt(0).toUpperCase() + user.role.slice(1)}</span
										>
										<button
											type="button"
											onclick={() => openEdit(user)}
											class="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100"
											aria-label="Edit {user.firstName} {user.lastName}"
										>
											<Edit size={16} aria-hidden="true" />
										</button>
									</div>
								</div>
								<div class="mt-3 flex items-center gap-4 text-xs text-gray-500">
									<span
										class="inline-flex rounded-full px-2 py-0.5 font-semibold {statusBadge(
											user.isActive
										)}">{user.isActive ? 'Active' : 'Inactive'}</span
									>
									{#if user.yearLevel}<span>{user.yearLevel} · Block {user.block}</span>{/if}
									<span>Last login: {timeAgo(user.lastLogin)}</span>
								</div>
							</div>
						{/each}
					</div>

					<!-- Pagination -->
					{#if pagination.totalPages > 1}
						<div
							class="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-4"
						>
							<p class="text-sm text-gray-500">
								Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(
									pagination.page * pagination.limit,
									pagination.total
								)} of {pagination.total.toLocaleString()} users
							</p>
							<div class="flex gap-2">
								<button
									type="button"
									onclick={() => {
										pagination.page -= 1;
										loadUsers();
									}}
									disabled={pagination.page <= 1}
									class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-white disabled:opacity-40"
									aria-label="Go to previous page">Previous</button
								>
								<button
									type="button"
									onclick={() => {
										pagination.page += 1;
										loadUsers();
									}}
									disabled={pagination.page >= pagination.totalPages}
									class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-white disabled:opacity-40"
									aria-label="Go to next page">Next</button
								>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		</div>
		<!-- End tabpanel -->

		<!-- ── CREATE USER TAB ───────────────────────────────────────────────── -->
	{:else if activeTab === 'create'}
		<div class="mx-auto max-w-2xl" role="tabpanel" id="create-panel" aria-labelledby="create-tab">
			<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
				<h2 class="text-lg font-semibold text-gray-900">Create New User</h2>
				<p class="mt-1 text-sm text-gray-500">Add a new user account with role-based permissions</p>

				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleCreateUser();
					}}
					class="mt-6 space-y-4"
				>
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label for="create-first-name" class="block text-sm font-medium text-gray-700"
								>First Name <span class="text-red-500">*</span></label
							>
							<input
								id="create-first-name"
								type="text"
								bind:value={createForm.firstName}
								class={inputCls}
								placeholder="Juan"
							/>
							{#if createErrors.firstName}<p class={errorCls}>{createErrors.firstName}</p>{/if}
						</div>
						<div>
							<label for="create-last-name" class="block text-sm font-medium text-gray-700"
								>Last Name <span class="text-red-500">*</span></label
							>
							<input
								id="create-last-name"
								type="text"
								bind:value={createForm.lastName}
								class={inputCls}
								placeholder="dela Cruz"
							/>
							{#if createErrors.lastName}<p class={errorCls}>{createErrors.lastName}</p>{/if}
						</div>
					</div>
					<div>
						<label for="create-email" class="block text-sm font-medium text-gray-700"
							>Email Address <span class="text-red-500">*</span></label
						>
						<input
							id="create-email"
							type="email"
							bind:value={createForm.email}
							class={inputCls}
							placeholder="juan@example.com"
						/>
						{#if createErrors.email}<p class={errorCls}>{createErrors.email}</p>{/if}
					</div>
					<div>
						<label for="create-password" class="block text-sm font-medium text-gray-700"
							>Password <span class="text-red-500">*</span></label
						>
						<input
							id="create-password"
							type="password"
							bind:value={createForm.password}
							class={inputCls}
							placeholder="Min. 8 characters"
						/>
						{#if createErrors.password}<p class={errorCls}>{createErrors.password}</p>{/if}
					</div>
					<div>
						<label for="create-role" class="block text-sm font-medium text-gray-700"
							>Role <span class="text-red-500">*</span></label
						>
						<select id="create-role" bind:value={createForm.role} class={inputCls}>
							<option value="">Select a role…</option>
							<option value="student">Student</option>
							<option value="instructor">Instructor</option>
							<option value="custodian">Custodian</option>
							<option value="superadmin">Superadmin</option>
						</select>
						{#if createErrors.role}<p class={errorCls}>{createErrors.role}</p>{/if}
					</div>

					{#if createForm.role === 'student'}
						<div class="space-y-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
							<p class="text-sm font-semibold text-blue-900">Student Details</p>
							<div class="grid gap-4 sm:grid-cols-2">
								<div>
									<label for="create-year-level" class="block text-sm font-medium text-blue-800"
										>Year Level <span class="text-red-500">*</span></label
									>
									<select id="create-year-level" bind:value={createForm.yearLevel} class={inputCls}>
										<option value="">Select year…</option>
										<option>1st Year</option><option>2nd Year</option><option>3rd Year</option
										><option>4th Year</option>
									</select>
									{#if createErrors.yearLevel}<p class={errorCls}>{createErrors.yearLevel}</p>{/if}
								</div>
								<div>
									<label for="create-block" class="block text-sm font-medium text-blue-800"
										>Block <span class="text-red-500">*</span></label
									>
									<select id="create-block" bind:value={createForm.block} class={inputCls}>
										<option value="">Select block…</option>
										<option>A</option><option>B</option><option>C</option><option>D</option>
									</select>
									{#if createErrors.block}<p class={errorCls}>{createErrors.block}</p>{/if}
								</div>
							</div>
						</div>
					{/if}

					<div class="flex justify-end gap-3 border-t border-gray-200 pt-5">
						<button
							type="button"
							onclick={() => (activeTab = 'all')}
							class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
							>Cancel</button
						>
						<button
							type="submit"
							disabled={createLoading}
							class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-pink-700 disabled:opacity-60"
						>
							{#if createLoading}<RefreshCw
									size={15}
									class="animate-spin"
									aria-hidden="true"
								/>{:else}<Plus size={15} aria-hidden="true" />{/if}
							Create User
						</button>
					</div>
				</form>
			</div>
		</div>

		<!-- ── BULK IMPORT TAB ───────────────────────────────────────────────── -->
	{:else if activeTab === 'bulk-import'}
		<div
			class="mx-auto max-w-3xl space-y-6"
			role="tabpanel"
			id="bulk-import-panel"
			aria-labelledby="bulk-import-tab"
		>
			<!-- Drop zone -->
			<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
				<h2 class="text-lg font-semibold text-gray-900">Bulk Import Users</h2>
				<p class="mt-1 text-sm text-gray-500">Import multiple users at once using a CSV file</p>

				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="mt-6 rounded-xl border-2 border-dashed p-10 text-center transition-colors {isDragging
						? 'border-pink-400 bg-pink-50'
						: 'border-gray-300 bg-gray-50 hover:border-pink-300 hover:bg-pink-50/50'}"
					ondragover={(e) => {
						e.preventDefault();
						isDragging = true;
					}}
					ondragleave={() => (isDragging = false)}
					ondrop={handleDrop}
					role="region"
					aria-label="File drop zone for CSV upload"
				>
					<Upload
						size={40}
						class="mx-auto {isDragging ? 'text-pink-500' : 'text-gray-400'}"
						aria-hidden="true"
					/>
					<p class="mt-3 text-sm font-semibold text-gray-800">Drop your CSV file here, or</p>
					<label
						for="bulk-file-input"
						class="mt-3 inline-block cursor-pointer rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-pink-700"
					>
						Browse File
						<input
							id="bulk-file-input"
							type="file"
							accept=".csv,.xlsx"
							class="sr-only"
							onchange={(e) => {
								const f = (e.target as HTMLInputElement).files?.[0];
								if (f) handleFileSelect(f);
							}}
						/>
					</label>
					<p class="mt-2 text-xs text-gray-400">Supports .csv files · max 10 MB</p>
					{#if bulkFile}<p class="mt-2 text-sm font-medium text-pink-700">
							Selected: {bulkFile.name}
						</p>{/if}
				</div>

				<!-- Template -->
				<div class="mt-4 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
					<Download size={18} class="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
					<div class="flex-1">
						<p class="text-sm font-semibold text-blue-900">CSV Template</p>
						<p class="mt-0.5 text-xs text-blue-700">
							Download the template to ensure correct column formatting
						</p>
						<p class="mt-1 font-mono text-xs text-blue-600">
							first_name, last_name, email, password, role, year_level, block
						</p>
					</div>
					<button
						type="button"
						onclick={downloadTemplate}
						class="shrink-0 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
						aria-label="Download CSV template"
					>
						Download
					</button>
				</div>
			</div>

			<!-- Parse errors -->
			{#if bulkErrors.length}
				<div class="rounded-xl border border-red-200 bg-red-50 p-4" role="alert" aria-live="polite">
					<p class="text-sm font-semibold text-red-900">Validation Errors ({bulkErrors.length})</p>
					<ul class="mt-2 space-y-1">
						{#each bulkErrors as err}<li class="text-xs text-red-700">• {err}</li>{/each}
					</ul>
				</div>
			{/if}

			<!-- Preview -->
			{#if bulkPreview.length}
				<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
					<div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
						<div>
							<h3 class="font-semibold text-gray-900">
								Preview — {bulkPreview.length} user{bulkPreview.length !== 1 ? 's' : ''} ready
							</h3>
							<p class="mt-0.5 text-xs text-gray-500">Review before importing</p>
						</div>
						<div class="flex gap-2">
							<button
								type="button"
								onclick={() => {
									bulkFile = null;
									bulkPreview = [];
								}}
								class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
								aria-label="Clear preview"
							>
								Clear
							</button>
							<button
								type="button"
								onclick={handleBulkImport}
								disabled={bulkImporting}
								class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-pink-700 disabled:opacity-60"
								aria-label="Import all users"
							>
								{#if bulkImporting}
									<RefreshCw size={15} class="animate-spin" aria-hidden="true" />Importing {bulkProgress}%
								{:else}
									<Upload size={15} aria-hidden="true" />Import All
								{/if}
							</button>
						</div>
					</div>

					{#if bulkImporting}
						<div
							class="border-b border-pink-100 bg-pink-50 px-6 py-3"
							role="status"
							aria-live="polite"
							aria-label="Import progress"
						>
							<div class="mb-1.5 flex items-center justify-between text-xs text-pink-700">
								<span>Importing users…</span><span>{bulkProgress}%</span>
							</div>
							<div class="h-1.5 w-full overflow-hidden rounded-full bg-pink-100">
								<div
									class="h-full rounded-full bg-pink-500 transition-all duration-300"
									style="width: {bulkProgress}%"
									role="progressbar"
									aria-valuenow={bulkProgress}
									aria-valuemin="0"
									aria-valuemax="100"
								></div>
							</div>
						</div>
					{/if}

					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead class="bg-gray-50">
								<tr>
									{#each Object.keys(bulkPreview[0]) as key}
										<th
											scope="col"
											class="px-4 py-3 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
											>{key.replace(/_/g, ' ')}</th
										>
									{/each}
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100">
								{#each bulkPreview.slice(0, 10) as row}
									<tr class="hover:bg-gray-50">
										{#each Object.values(row) as val}
											<td class="max-w-[150px] truncate px-4 py-3 text-gray-700">{val || '—'}</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					{#if bulkPreview.length > 10}
						<div
							class="border-t border-gray-200 bg-gray-50 px-6 py-3 text-center text-xs text-gray-500"
						>
							… and {bulkPreview.length - 10} more rows
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Close dropdown on outside click -->
	{#if openDropdown}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="fixed inset-0 z-20" onclick={() => (openDropdown = null)} role="presentation"></div>
	{/if}
</div>
