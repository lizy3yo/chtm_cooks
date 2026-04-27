<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Search,
		Plus,
		Archive,
		ArchiveRestore,
		BookOpen,
		Info,
		Edit,
		Trash2,
		Users as UsersIcon,
		GraduationCap,
		RefreshCw,
		Wifi,
		WifiOff,
		X,
		CheckCircle,
		AlertCircle,
		ChevronRight,
		BarChart3,
		UserCheck,
		Clock
	} from 'lucide-svelte';
	import {
		classCodesAPI,
		type ClassCodeResponse,
		type ClassCodeStats,
		type ClassCodeRealtimeEvent,
		type InstructorRef,
		type StudentRef,
		type Semester,
		type CreateClassCodeRequest
	} from '$lib/api/classCodes';
	import { usersAPI, type UserResponse } from '$lib/api/users';
	import { toastStore } from '$lib/stores/toast';
	import { confirmStore } from '$lib/stores/confirm';

	type Tab = 'all' | 'create' | 'assign' | 'archived';

	// ─── UI State ─────────────────────────────────────────────────────────────────
	let activeTab = $state<Tab>('all');
	let sseConnected = $state(false);

	// ─── List State ───────────────────────────────────────────────────────────────
	let classCodes = $state<ClassCodeResponse[]>([]);
	let archivedCodes = $state<ClassCodeResponse[]>([]);
	let pagination = $state({ page: 1, limit: 24, total: 0, totalPages: 1 });
	let archivedPagination = $state({ page: 1, limit: 24, total: 0, totalPages: 1 });
	let loading = $state(false);
	let archivedLoading = $state(false);
	let searchQuery = $state('');
	let selectedSemester = $state('');
	let selectedYear = $state('');
	let debounceTimer: ReturnType<typeof setTimeout>;

	// ─── Stats State ─────────────────────────────────────────────────────────────
	let stats = $state<ClassCodeStats>({
		totalClasses: 0,
		activeClasses: 0,
		archivedClasses: 0,
		totalStudents: 0,
		avgClassSize: 0,
		totalInstructors: 0
	});

	// ─── Create Form ──────────────────────────────────────────────────────────────
	let createForm = $state({
		courseCode: '',
		courseName: '',
		section: '',
		academicYear: '',
		semester: '' as Semester | '',
		maxEnrollment: 40,
		instructorIds: [] as string[]
	});
	let createLoading = $state(false);
	let createErrors = $state<Record<string, string>>({});
	let codePreview = $derived(() => {
		if (!createForm.courseCode || !createForm.section || !createForm.academicYear) return '';
		const year = createForm.academicYear.split('-')[1] || createForm.academicYear.split('-')[0];
		return `${year}-${createForm.courseCode.toUpperCase()}-${createForm.section.toUpperCase()}`;
	});

	// ─── Instructor Multi-Select ──────────────────────────────────────────────────
	let availableInstructors = $state<UserResponse[]>([]);
	let instructorSearchQuery = $state('');
	let filteredInstructors = $derived(() =>
		availableInstructors.filter((i) => {
			if (!instructorSearchQuery) return true;
			const q = instructorSearchQuery.toLowerCase();
			return (
				i.firstName.toLowerCase().includes(q) ||
				i.lastName.toLowerCase().includes(q) ||
				i.email.toLowerCase().includes(q)
			);
		})
	);

	// ─── Edit Modal ───────────────────────────────────────────────────────────────
	let editingClass = $state<ClassCodeResponse | null>(null);
	let editForm = $state({
		courseName: '',
		maxEnrollment: 40,
		semester: '' as Semester | '',
		academicYear: '',
		instructorIds: [] as string[]
	});
	let editLoading = $state(false);

	// ─── Assign Students Panel ────────────────────────────────────────────────────
	let selectedClassForAssign = $state<ClassCodeResponse | null>(null);
	let assignedClassDetail = $state<ClassCodeResponse | null>(null);
	let availableStudents = $state<UserResponse[]>([]);
	let studentSearchQuery = $state('');
	let assignLoading = $state(false);
	let assignClassSelectId = $state('');

	let filteredStudents = $derived(() => {
		if (!studentSearchQuery) return availableStudents;
		const q = studentSearchQuery.toLowerCase();
		return availableStudents.filter(
			(s) =>
				s.firstName.toLowerCase().includes(q) ||
				s.lastName.toLowerCase().includes(q) ||
				s.email.toLowerCase().includes(q)
		);
	});

	let enrolledStudentIds = $derived(() => new Set(assignedClassDetail?.studentIds ?? []));

	let _pollInterval: ReturnType<typeof setInterval> | null = null;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;

	function hydrateFromCache(): boolean {
		const cached = classCodesAPI.peekCachedList({
			search: searchQuery || undefined,
			semester: selectedSemester || undefined,
			academicYear: selectedYear || undefined,
			archived: false,
			page: pagination.page,
			limit: pagination.limit
		});
		if (!cached) return false;

		classCodes = cached.classCodes;
		pagination = cached.pagination;
		loading = false;
		return true;
	}

	function scheduleRefresh(forceRefresh = false): void {
		if (refreshTimer !== null) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			void loadClasses(false, forceRefresh);
			void loadStats(forceRefresh);
			if (activeTab === 'archived') void loadArchived(false, forceRefresh);
			if (assignedClassDetail) void refreshAssignedClass();
		}, 250);
	}

	// ─── Lifecycle ────────────────────────────────────────────────────────────────
	let unsubscribeSSE: (() => void) | null = null;
	onMount(() => {
		hydrateFromCache();
		void loadClasses(classCodes.length === 0, false);
		void loadStats(false);
		void loadInstructors();
		void loadStudents();

		unsubscribeSSE = classCodesAPI.subscribeToChanges((event: ClassCodeRealtimeEvent) => {
			sseConnected = true;
			scheduleRefresh(true);
			const msgs: Record<string, string> = {
				class_created: 'A new class was created',
				class_updated: 'A class was updated',
				class_archived: 'A class was archived',
				class_deleted: 'A class was removed',
				enrollment_updated: 'Class enrollment changed'
			};
			toastStore.info(msgs[event.action] || 'Class list updated', 'Live Update');
		});
		setTimeout(() => {
			sseConnected = true;
		}, 1500);

		// --- 30-second polling fallback ---
		_pollInterval = setInterval(() => {
			void loadClasses(false, true);
			void loadStats(true);
			if (activeTab === 'archived') void loadArchived(false, true);
			if (assignedClassDetail) void refreshAssignedClass();
		}, 30_000);

		// --- Refresh on tab/window focus ---
		const onFocus = () => { void loadClasses(false, true); void loadStats(true); };
		const onVisible = () => { if (document.visibilityState === 'visible') { void loadClasses(false, true); void loadStats(true); } };
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

	const currentYear = new Date().getFullYear();
	const academicYearOptions = [
		`${currentYear - 1}-${currentYear}`,
		`${currentYear}-${currentYear + 1}`,
		`${currentYear + 1}-${currentYear + 2}`
	];

	// ─── Data Loading ─────────────────────────────────────────────────────────────
	async function loadClasses(showLoader = true, forceRefresh = true) {
		if (showLoader && classCodes.length === 0) loading = true;
		try {
			const res = await classCodesAPI.getAll({
				search: searchQuery || undefined,
				semester: selectedSemester || undefined,
				academicYear: selectedYear || undefined,
				archived: false,
				page: pagination.page,
				limit: pagination.limit,
				forceRefresh
			});
			classCodes = res.classCodes;
			pagination = res.pagination;
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to load class codes');
		} finally {
			loading = false;
		}
	}

	async function loadArchived(showLoader = true, forceRefresh = true) {
		if (showLoader) archivedLoading = true;
		try {
			const res = await classCodesAPI.getAll({
				archived: true,
				page: archivedPagination.page,
				limit: archivedPagination.limit,
				forceRefresh
			});
			archivedCodes = res.classCodes;
			archivedPagination = res.pagination;
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to load archived classes');
		} finally {
			archivedLoading = false;
		}
	}

	async function loadStats(forceRefresh = true) {
		try {
			stats = await classCodesAPI.getStats(forceRefresh);
		} catch {
			/* silent */
		}
	}

	async function loadInstructors() {
		try {
			const res = await usersAPI.getAll({ role: 'instructor', limit: 200 });
			availableInstructors = res.users.filter((u) => u.isActive);
		} catch {
			/* silent */
		}
	}

	async function loadStudents() {
		try {
			const res = await usersAPI.getAll({ role: 'student', limit: 500 });
			availableStudents = res.users.filter((u) => u.isActive);
		} catch {
			/* silent */
		}
	}

	async function refreshAssignedClass() {
		if (!assignedClassDetail) return;
		try {
			assignedClassDetail = await classCodesAPI.getById(assignedClassDetail.id, true);
		} catch {
			/* silent */
		}
	}

	// ─── Search Debounce ─────────────────────────────────────────────────────────
	function onSearchInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			pagination.page = 1;
			loadClasses();
		}, 300);
	}

	function onFilterChange() {
		pagination.page = 1;
		loadClasses();
	}

	function onTabChange(tab: Tab) {
		activeTab = tab;
		if (tab === 'all') loadClasses();
		if (tab === 'archived') loadArchived();
		if (tab === 'assign' && !selectedClassForAssign) assignedClassDetail = null;
	}

	// ─── Create Class ─────────────────────────────────────────────────────────────
	function validateCreate(): boolean {
		const errs: Record<string, string> = {};
		if (!createForm.courseCode.trim()) errs.courseCode = 'Required';
		if (!createForm.courseName.trim()) errs.courseName = 'Required';
		if (!createForm.section.trim()) errs.section = 'Required';
		if (!createForm.academicYear) errs.academicYear = 'Required';
		if (!createForm.semester) errs.semester = 'Required';
		if (!createForm.maxEnrollment || createForm.maxEnrollment < 1)
			errs.maxEnrollment = 'Must be at least 1';
		createErrors = errs;
		return Object.keys(errs).length === 0;
	}

	async function handleCreate() {
		if (!validateCreate()) return;
		createLoading = true;
		try {
			const payload: CreateClassCodeRequest = {
				courseCode: createForm.courseCode.trim().toUpperCase(),
				courseName: createForm.courseName.trim(),
				section: createForm.section.trim().toUpperCase(),
				academicYear: createForm.academicYear,
				semester: createForm.semester as Semester,
				maxEnrollment: Number(createForm.maxEnrollment),
				instructorIds: createForm.instructorIds
			};
			const created = await classCodesAPI.create(payload);
			toastStore.success(`Class "${created.code}" created successfully`, 'Class Created');
			createForm = {
				courseCode: '',
				courseName: '',
				section: '',
				academicYear: '',
				semester: '',
				maxEnrollment: 40,
				instructorIds: []
			};
			createErrors = {};
			instructorSearchQuery = '';
			activeTab = 'all';
			await Promise.all([loadClasses(), loadStats(true)]);
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to create class code', 'Error');
		} finally {
			createLoading = false;
		}
	}

	function toggleInstructorCreate(id: string) {
		const idx = createForm.instructorIds.indexOf(id);
		if (idx === -1) createForm.instructorIds = [...createForm.instructorIds, id];
		else createForm.instructorIds = createForm.instructorIds.filter((i) => i !== id);
	}

	// ─── Edit Class ───────────────────────────────────────────────────────────────
	function openEdit(cc: ClassCodeResponse) {
		editingClass = cc;
		editForm = {
			courseName: cc.courseName,
			maxEnrollment: cc.maxEnrollment,
			semester: cc.semester,
			academicYear: cc.academicYear,
			instructorIds: cc.instructorIds ?? []
		};
	}

	async function handleEdit() {
		if (!editingClass) return;
		editLoading = true;
		try {
			await classCodesAPI.update(editingClass.id, {
				courseName: editForm.courseName,
				maxEnrollment: Number(editForm.maxEnrollment),
				semester: editForm.semester as Semester,
				academicYear: editForm.academicYear,
				instructorIds: editForm.instructorIds
			});
			toastStore.success('Class updated successfully', 'Saved');
			editingClass = null;
			await Promise.all([loadClasses(false), loadStats(true)]);
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to update class', 'Error');
		} finally {
			editLoading = false;
		}
	}

	function toggleInstructorEdit(id: string) {
		const idx = editForm.instructorIds.indexOf(id);
		if (idx === -1) editForm.instructorIds = [...editForm.instructorIds, id];
		else editForm.instructorIds = editForm.instructorIds.filter((i) => i !== id);
	}

	// ─── Archive / Delete ─────────────────────────────────────────────────────────
	async function handleArchive(cc: ClassCodeResponse) {
		const confirmed = await confirmStore.confirm({
			type: 'warning',
			title: 'Archive Class',
			message: `Archive class "${cc.code}"? It will be preserved for historical reporting but no longer active.`,
			confirmText: 'Archive'
		});
		if (!confirmed) return;
		try {
			await classCodesAPI.archive(cc.id);
			toastStore.success(`"${cc.code}" archived successfully`);
			await Promise.all([loadClasses(false), loadStats(true)]);
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to archive class');
		}
	}

	async function handleUnarchive(cc: ClassCodeResponse) {
		const confirmed = await confirmStore.confirm({
			type: 'info',
			title: 'Restore Class',
			message: `Restore "${cc.code}" to active classes?`,
			confirmText: 'Restore'
		});
		if (!confirmed) return;
		try {
			await classCodesAPI.unarchive(cc.id);
			toastStore.success(`"${cc.code}" restored successfully`);
			await Promise.all([loadArchived(false), loadStats(true)]);
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to restore class');
		}
	}

	async function handleDelete(cc: ClassCodeResponse) {
		const confirmed = await confirmStore.danger(
			`Permanently delete class "${cc.code}"? This action cannot be undone and all enrollment data will be lost.`,
			'Delete Class',
			'Delete Permanently'
		);
		if (!confirmed) return;
		try {
			await classCodesAPI.delete(cc.id);
			toastStore.success(`"${cc.code}" deleted permanently`);
			if (cc.isArchived) await loadArchived(false);
			else await loadClasses(false);
			await loadStats(true);
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to delete class');
		}
	}

	// ─── Assign Students ──────────────────────────────────────────────────────────
	async function selectClassForAssign(id: string) {
		if (!id) {
			assignedClassDetail = null;
			selectedClassForAssign = null;
			return;
		}
		try {
			assignedClassDetail = await classCodesAPI.getById(id, true);
			selectedClassForAssign = assignedClassDetail;
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to load class details');
		}
	}

	async function handleEnroll(studentId: string) {
		if (!assignedClassDetail) return;
		assignLoading = true;
		try {
			await classCodesAPI.enrollStudents(assignedClassDetail.id, [studentId]);
			await refreshAssignedClass();
			toastStore.success('Student enrolled successfully');
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to enroll student');
		} finally {
			assignLoading = false;
		}
	}

	async function handleUnenroll(studentId: string) {
		if (!assignedClassDetail) return;
		assignLoading = true;
		try {
			await classCodesAPI.unenrollStudents(assignedClassDetail.id, [studentId]);
			await refreshAssignedClass();
			toastStore.success('Student removed from class');
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to remove student');
		} finally {
			assignLoading = false;
		}
	}

	// ─── Helpers ──────────────────────────────────────────────────────────────────
	function getSemesterColor(semester: string) {
		const map: Record<string, string> = {
			First: 'bg-blue-100 text-blue-800 border border-blue-200',
			Second: 'bg-violet-100 text-violet-800 border border-violet-200',
			Summer: 'bg-amber-100 text-amber-800 border border-amber-200'
		};
		return map[semester] || 'bg-gray-100 text-gray-700';
	}

	function getEnrollmentPct(current: number, max: number) {
		return max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
	}

	function getEnrollmentColor(pct: number) {
		if (pct >= 100) return 'bg-red-500';
		if (pct >= 80) return 'bg-amber-500';
		return 'bg-emerald-500';
	}

	function getEnrollmentTextColor(pct: number) {
		if (pct >= 100) return 'text-red-600';
		if (pct >= 80) return 'text-amber-600';
		return 'text-emerald-600';
	}

	function avatar(firstName: string, lastName: string) {
		return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
	}

	function avatarColor(index: number) {
		const colors = [
			'from-violet-500 to-violet-700',
			'from-pink-500 to-rose-600',
			'from-blue-500 to-blue-700',
			'from-emerald-500 to-emerald-700',
			'from-amber-500 to-amber-700',
			'from-indigo-500 to-indigo-700'
		];
		return colors[index % colors.length];
	}

	function formatDate(d: string) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-PH', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	const inputCls =
		'mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20 transition bg-white';
	const errorCls = 'mt-1 text-xs text-red-600';
</script>

<!-- ─── Edit Class Slide-Over ──────────────────────────────────────────────── -->
{#if editingClass}
	<div
		class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
		onclick={() => (editingClass = null)}
		role="presentation"
	></div>
	<div class="fixed top-0 right-0 z-50 flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-lg">
		<div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
			<div>
				<h2 class="text-lg font-semibold text-gray-900">Edit Class</h2>
				<p class="font-mono text-xs text-pink-600">{editingClass.code}</p>
			</div>
			<button
				onclick={() => (editingClass = null)}
				class="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
				><X size={20} /></button
			>
		</div>
		<div class="flex-1 space-y-5 overflow-y-auto px-6 py-6">
			<div>
				<label for="edit-course-name" class="block text-sm font-medium text-gray-700"
					>Course Name</label
				>
				<input
					id="edit-course-name"
					type="text"
					bind:value={editForm.courseName}
					class={inputCls}
					placeholder="e.g. Culinary Arts Fundamentals"
				/>
			</div>
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label for="edit-semester" class="block text-sm font-medium text-gray-700">Semester</label
					>
					<select id="edit-semester" bind:value={editForm.semester} class={inputCls}>
						<option value="First">First Semester</option>
						<option value="Second">Second Semester</option>
						<option value="Summer">Summer</option>
					</select>
				</div>
				<div>
					<label for="edit-academic-year" class="block text-sm font-medium text-gray-700"
						>Academic Year</label
					>
					<select id="edit-academic-year" bind:value={editForm.academicYear} class={inputCls}>
						{#each academicYearOptions as yr}
							<option value={yr}>{yr}</option>
						{/each}
					</select>
				</div>
			</div>
			<div>
				<label for="edit-max-enrollment" class="block text-sm font-medium text-gray-700"
					>Max Enrollment</label
				>
				<input
					id="edit-max-enrollment"
					type="number"
					min="1"
					max="500"
					bind:value={editForm.maxEnrollment}
					class={inputCls}
				/>
			</div>
			<fieldset>
				<legend class="mb-2 block text-sm font-medium text-gray-700">Assign Instructors</legend>
				<div
					class="max-h-52 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200"
				>
					{#each availableInstructors as instructor, i}
						<label
							class="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-gray-50"
						>
							<input
								type="checkbox"
								checked={editForm.instructorIds.includes(instructor.id)}
								onchange={() => toggleInstructorEdit(instructor.id)}
								class="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
							/>
							<div
								class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br {avatarColor(
									i
								)} text-xs font-bold text-white"
							>
								{avatar(instructor.firstName, instructor.lastName)}
							</div>
							<div class="min-w-0">
								<p class="truncate text-sm font-medium text-gray-900">
									{instructor.firstName}
									{instructor.lastName}
								</p>
								<p class="truncate text-xs text-gray-500">{instructor.email}</p>
							</div>
						</label>
					{:else}
						<p class="px-4 py-3 text-sm text-gray-500">No instructors available</p>
					{/each}
				</div>
				{#if editForm.instructorIds.length > 0}
					<p class="mt-1.5 text-xs font-medium text-pink-600">
						{editForm.instructorIds.length} instructor(s) selected
					</p>
				{/if}
			</fieldset>
		</div>
		<div class="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
			<button
				onclick={() => (editingClass = null)}
				class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
				>Cancel</button
			>
			<button
				onclick={handleEdit}
				disabled={editLoading}
				class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-pink-700 disabled:opacity-60"
			>
				{#if editLoading}<RefreshCw size={16} class="animate-spin" />{/if}
				Save Changes
			</button>
		</div>
	</div>
{/if}

<!-- ─── Main Page ─────────────────────────────────────────────────────────── -->
<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<div class="flex items-center gap-3">
				<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Class Code Management</h1>
				<!-- SSE indicator -->
				<div
					class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium
					{sseConnected
						? 'border-emerald-200 bg-emerald-50 text-emerald-700'
						: 'border-gray-200 bg-gray-50 text-gray-500'}"
				>
					{#if sseConnected}
						<Wifi size={12} class="text-emerald-500" />Live
					{:else}
						<WifiOff size={12} />Connecting...
					{/if}
				</div>
			</div>
			<p class="mt-0.5 text-sm text-gray-500">
				Organize students and instructors by academic classes and sections
			</p>
		</div>
	</div>

	<!-- Tabs -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex gap-1">
			{#each [['all', 'All Classes'], ['create', 'Create Class'], ['assign', 'Assign Students'], ['archived', 'Archived']] as [tab, label]}
				<button
					onclick={() => onTabChange(tab as Tab)}
					class="border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors
						{activeTab === tab
						? 'border-pink-600 text-pink-600'
						: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
					>{label}</button
				>
			{/each}
		</nav>
	</div>

	<!-- ── ALL CLASSES TAB ─────────────────────────────────────────────────── -->
	{#if activeTab === 'all'}
		<!-- Stats Cards -->
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#if loading && classCodes.length === 0}
				{#each Array(4) as _}
					<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
						<div class="animate-pulse space-y-3">
							<div class="flex items-center justify-between">
								<div class="h-4 w-24 rounded bg-gray-200"></div>
								<div class="h-8 w-8 rounded-lg bg-gray-200"></div>
							</div>
							<div class="h-9 w-16 rounded bg-gray-200"></div>
							<div class="h-3 w-32 rounded bg-gray-200"></div>
						</div>
					</div>
				{/each}
			{:else}
			<div
				class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
			>
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium text-gray-500">Total Classes</p>
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
						<BookOpen size={16} class="text-gray-600" />
					</div>
				</div>
				<p class="mt-2 text-3xl font-bold text-gray-900">{stats.totalClasses}</p>
				<p class="mt-1 text-xs text-gray-400">
					{stats.activeClasses} active · {stats.archivedClasses} archived
				</p>
			</div>
			<div
				class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
			>
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium text-gray-500">Total Students</p>
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-100">
						<GraduationCap size={16} class="text-pink-600" />
					</div>
				</div>
				<p class="mt-2 text-3xl font-bold text-pink-600">{stats.totalStudents.toLocaleString()}</p>
				<p class="mt-1 text-xs text-gray-400">Enrolled across all classes</p>
			</div>
			<div
				class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
			>
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium text-gray-500">Avg Class Size</p>
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100">
						<BarChart3 size={16} class="text-purple-600" />
					</div>
				</div>
				<p class="mt-2 text-3xl font-bold text-purple-600">{stats.avgClassSize}</p>
				<p class="mt-1 text-xs text-gray-400">Students per class</p>
			</div>
			<div
				class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
			>
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium text-gray-500">Instructors</p>
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
						<UserCheck size={16} class="text-blue-600" />
					</div>
				</div>
				<p class="mt-2 text-3xl font-bold text-blue-600">{stats.totalInstructors}</p>
				<p class="mt-1 text-xs text-gray-400">Teaching this semester</p>
			</div>
			{/if}
		</div>

		<!-- Filters -->
		<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
				<div class="relative flex-1">
					<label for="search-classes" class="sr-only">Search classes</label>
					<Search size={16} class="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" />
					<input
						id="search-classes"
						type="text"
						bind:value={searchQuery}
						oninput={onSearchInput}
						placeholder="Search classes, courses…"
						class="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-9 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
					/>
				</div>
				<label for="filter-semester" class="sr-only">Filter by semester</label>
				<select
					id="filter-semester"
					bind:value={selectedSemester}
					onchange={onFilterChange}
					class="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
				>
					<option value="">All Semesters</option>
					<option value="First">First Semester</option>
					<option value="Second">Second Semester</option>
					<option value="Summer">Summer</option>
				</select>
				<label for="filter-year" class="sr-only">Filter by academic year</label>
				<select
					id="filter-year"
					bind:value={selectedYear}
					onchange={onFilterChange}
					class="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
				>
					<option value="">All Years</option>
					{#each academicYearOptions as yr}
						<option value={yr}>{yr}</option>
					{/each}
				</select>
				<button
					onclick={() => onTabChange('create')}
					class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-sm transition hover:bg-pink-700"
					><Plus size={16} /> Create Class</button
				>
			</div>
		</div>

		<!-- Classes Grid -->
		{#if loading && classCodes.length === 0}
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each Array(6) as _}
					<div class="animate-pulse rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
						<div class="flex items-start justify-between">
							<div class="flex-1 space-y-2">
								<div class="flex items-center gap-2">
									<div class="h-5 w-5 rounded-full bg-gray-200"></div>
									<div class="h-5 w-24 rounded bg-gray-200"></div>
								</div>
								<div class="h-4 w-40 rounded bg-gray-200"></div>
							</div>
							<div class="ml-2 flex gap-1">
								<div class="h-8 w-8 rounded-lg bg-gray-200"></div>
								<div class="h-8 w-8 rounded-lg bg-gray-200"></div>
								<div class="h-8 w-8 rounded-lg bg-gray-200"></div>
							</div>
						</div>
						<div class="mt-4 space-y-2">
							<div class="flex items-center justify-between">
								<div class="h-4 w-16 rounded bg-gray-200"></div>
								<div class="h-4 w-20 rounded-full bg-gray-200"></div>
							</div>
							<div class="flex items-center justify-between">
								<div class="h-4 w-24 rounded bg-gray-200"></div>
								<div class="h-4 w-24 rounded bg-gray-200"></div>
							</div>
							<div class="flex items-center justify-between">
								<div class="h-4 w-16 rounded bg-gray-200"></div>
								<div class="h-4 w-24 rounded bg-gray-200"></div>
							</div>
						</div>
						<div class="mt-4">
							<div class="mb-1.5 flex items-center justify-between">
								<div class="h-4 w-20 rounded bg-gray-200"></div>
								<div class="h-4 w-12 rounded bg-gray-200"></div>
							</div>
							<div class="h-2 w-full rounded-full bg-gray-200"></div>
							<div class="mt-1 flex justify-end">
								<div class="h-3 w-16 rounded bg-gray-200"></div>
							</div>
						</div>
						<div class="mt-4 border-t border-gray-100 pt-4">
							<div class="mb-2 h-3 w-24 rounded bg-gray-200"></div>
							<div class="flex -space-x-2">
								{#each Array(3) as _}
									<div class="h-7 w-7 rounded-full border-2 border-white bg-gray-200"></div>
								{/each}
							</div>
						</div>
						<div class="mt-4">
							<div class="h-9 w-full rounded-lg bg-gray-200"></div>
						</div>
					</div>
				{/each}
			</div>
		{:else if classCodes.length === 0}
			<div class="flex flex-col items-center justify-center py-20 text-center">
				<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
					<BookOpen size={28} class="text-gray-300" />
				</div>
				<p class="text-base font-semibold text-gray-900">No classes found</p>
				<p class="mt-1 text-sm text-gray-500">Try adjusting your filters or create a new class</p>
				<button
					onclick={() => onTabChange('create')}
					class="mt-4 inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-pink-700"
				>
					<Plus size={16} /> Create First Class
				</button>
			</div>
		{:else}
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each classCodes as cc (cc.id)}
					{@const pct = getEnrollmentPct(cc.studentCount, cc.maxEnrollment)}
					<div
						class="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-pink-300 hover:shadow-md"
					>
						<!-- Card header -->
						<div class="flex items-start justify-between">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<BookOpen size={18} class="shrink-0 text-pink-600" />
									<h3 class="truncate font-mono text-sm font-bold text-gray-900">{cc.code}</h3>
								</div>
								<p class="mt-0.5 truncate text-sm text-gray-600">{cc.courseName}</p>
							</div>
							<!-- Actions -->
							<div
								class="ml-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100"
							>
								<button
									onclick={() => openEdit(cc)}
									class="rounded-lg p-1.5 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600"
									title="Edit class"><Edit size={15} /></button
								>
								<button
									onclick={() => handleArchive(cc)}
									class="rounded-lg p-1.5 text-gray-400 transition hover:bg-amber-50 hover:text-amber-600"
									title="Archive class"><Archive size={15} /></button
								>
								<button
									onclick={() => handleDelete(cc)}
									class="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
									title="Delete class"><Trash2 size={15} /></button
								>
							</div>
						</div>

						<!-- Meta -->
						<div class="mt-4 space-y-2">
							<div class="flex items-center justify-between text-sm">
								<span class="text-gray-500">Semester</span>
								<span
									class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold {getSemesterColor(
										cc.semester
									)}">{cc.semester}</span
								>
							</div>
							<div class="flex items-center justify-between text-sm">
								<span class="text-gray-500">Academic Year</span>
								<span class="font-medium text-gray-900">{cc.academicYear}</span>
							</div>
							<div class="flex items-center justify-between text-sm">
								<span class="text-gray-500">Created</span>
								<span class="text-gray-600">{formatDate(cc.createdAt)}</span>
							</div>
						</div>

						<!-- Enrollment progress -->
						<div class="mt-4">
							<div class="mb-1.5 flex items-center justify-between text-sm">
								<span class="text-gray-500">Enrollment</span>
								<span class="font-semibold {getEnrollmentTextColor(pct)}"
									>{cc.studentCount}/{cc.maxEnrollment}</span
								>
							</div>
							<div class="h-2 w-full overflow-hidden rounded-full bg-gray-100">
								<div
									class="h-2 rounded-full transition-all duration-500 {getEnrollmentColor(pct)}"
									style="width: {pct}%"
								></div>
							</div>
							<p class="mt-1 text-right text-xs text-gray-400">{pct}% capacity</p>
						</div>

						<!-- Instructors -->
						<div class="mt-4 border-t border-gray-100 pt-4">
							<p class="mb-2 text-xs font-medium text-gray-500">
								Instructors ({cc.instructorCount})
							</p>
							{#if cc.instructorCount === 0}
								<p class="text-xs text-gray-400 italic">No instructors assigned</p>
							{:else}
								<div class="flex -space-x-2 overflow-hidden">
									{#each (cc.instructorIds ?? []).slice(0, 5) as iid, i}
										<div
											class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-linear-to-br {avatarColor(
												i
											)} text-xs font-bold text-white shadow-sm"
											title="Instructor"
										>
											{iid.slice(0, 1).toUpperCase()}
										</div>
									{/each}
									{#if cc.instructorCount > 5}
										<div
											class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-200 text-xs font-bold text-gray-600"
										>
											+{cc.instructorCount - 5}
										</div>
									{/if}
								</div>
							{/if}
						</div>

						<!-- Actions footer -->
						<div class="mt-4 flex gap-2">
							<button
								onclick={() => {
									assignClassSelectId = cc.id;
									activeTab = 'assign';
									selectClassForAssign(cc.id);
								}}
								class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
							>
								<UsersIcon size={14} /> Manage Roster
							</button>
							<button
								onclick={() => openEdit(cc)}
								class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-pink-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-pink-700"
							>
								<Edit size={14} /> Edit
							</button>
						</div>
					</div>
				{/each}
			</div>

			<!-- Pagination -->
			{#if pagination.totalPages > 1}
				<div
					class="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-6 py-4 shadow-sm"
				>
					<p class="text-sm text-gray-500">
						Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(
							pagination.page * pagination.limit,
							pagination.total
						)} of {pagination.total.toLocaleString()} classes
					</p>
					<div class="flex gap-2">
						<button
							onclick={() => {
								pagination.page -= 1;
								loadClasses();
							}}
							disabled={pagination.page <= 1}
							class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
							>Previous</button
						>
						<button
							onclick={() => {
								pagination.page += 1;
								loadClasses();
							}}
							disabled={pagination.page >= pagination.totalPages}
							class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
							>Next</button
						>
					</div>
				</div>
			{/if}
		{/if}

		<!-- ── CREATE CLASS TAB ────────────────────────────────────────────────── -->
	{:else if activeTab === 'create'}
		<div class="mx-auto max-w-2xl">
			<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
				<h2 class="text-lg font-semibold text-gray-900">Create New Class Code</h2>
				<p class="mt-1 text-sm text-gray-500">
					Set up a new academic class section with assigned instructors
				</p>

				<!-- Code preview -->
				{#if codePreview()}
					<div class="mt-4 flex items-center gap-3 rounded-lg bg-gray-900 px-4 py-3">
						<CheckCircle size={16} class="shrink-0 text-emerald-400" />
						<div>
							<p class="text-xs text-gray-400">Generated Class Code</p>
							<p class="font-mono text-base font-bold tracking-widest text-white">
								{codePreview()}
							</p>
						</div>
					</div>
				{/if}

				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleCreate();
					}}
					class="mt-6 space-y-5"
				>
					<!-- Course Code & Section -->
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label for="create-course-code" class="block text-sm font-medium text-gray-700"
								>Course Code <span class="text-red-500">*</span></label
							>
							<input
								id="create-course-code"
								type="text"
								bind:value={createForm.courseCode}
								placeholder="e.g. CHTM101"
								class="{inputCls} {createErrors.courseCode ? 'border-red-400' : ''} uppercase"
								aria-required="true"
								aria-invalid={createErrors.courseCode ? 'true' : 'false'}
								aria-describedby={createErrors.courseCode ? 'create-course-code-error' : undefined}
							/>
							{#if createErrors.courseCode}<p id="create-course-code-error" class={errorCls}>
									{createErrors.courseCode}
								</p>{/if}
						</div>
						<div>
							<label for="create-section" class="block text-sm font-medium text-gray-700"
								>Section <span class="text-red-500">*</span></label
							>
							<input
								id="create-section"
								type="text"
								bind:value={createForm.section}
								placeholder="e.g. A"
								class="{inputCls} {createErrors.section ? 'border-red-400' : ''} uppercase"
								aria-required="true"
								aria-invalid={createErrors.section ? 'true' : 'false'}
								aria-describedby={createErrors.section ? 'create-section-error' : undefined}
							/>
							{#if createErrors.section}<p id="create-section-error" class={errorCls}>
									{createErrors.section}
								</p>{/if}
						</div>
					</div>

					<!-- Course Name -->
					<div>
						<label for="create-course-name" class="block text-sm font-medium text-gray-700"
							>Course Name <span class="text-red-500">*</span></label
						>
						<input
							id="create-course-name"
							type="text"
							bind:value={createForm.courseName}
							placeholder="e.g. Culinary Arts Fundamentals"
							class="{inputCls} {createErrors.courseName ? 'border-red-400' : ''}"
							aria-required="true"
							aria-invalid={createErrors.courseName ? 'true' : 'false'}
							aria-describedby={createErrors.courseName ? 'create-course-name-error' : undefined}
						/>
						{#if createErrors.courseName}<p id="create-course-name-error" class={errorCls}>
								{createErrors.courseName}
							</p>{/if}
					</div>

					<!-- Academic Year & Semester -->
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label for="create-academic-year" class="block text-sm font-medium text-gray-700"
								>Academic Year <span class="text-red-500">*</span></label
							>
							<select
								id="create-academic-year"
								bind:value={createForm.academicYear}
								class="{inputCls} {createErrors.academicYear ? 'border-red-400' : ''}"
								aria-required="true"
								aria-invalid={createErrors.academicYear ? 'true' : 'false'}
								aria-describedby={createErrors.academicYear
									? 'create-academic-year-error'
									: undefined}
							>
								<option value="">Select year…</option>
								{#each academicYearOptions as yr}
									<option value={yr}>{yr}</option>
								{/each}
							</select>
							{#if createErrors.academicYear}<p id="create-academic-year-error" class={errorCls}>
									{createErrors.academicYear}
								</p>{/if}
						</div>
						<div>
							<label for="create-semester" class="block text-sm font-medium text-gray-700"
								>Semester <span class="text-red-500">*</span></label
							>
							<select
								id="create-semester"
								bind:value={createForm.semester}
								class="{inputCls} {createErrors.semester ? 'border-red-400' : ''}"
								aria-required="true"
								aria-invalid={createErrors.semester ? 'true' : 'false'}
								aria-describedby={createErrors.semester ? 'create-semester-error' : undefined}
							>
								<option value="">Select semester…</option>
								<option value="First">First Semester</option>
								<option value="Second">Second Semester</option>
								<option value="Summer">Summer</option>
							</select>
							{#if createErrors.semester}<p id="create-semester-error" class={errorCls}>
									{createErrors.semester}
								</p>{/if}
						</div>
					</div>

					<!-- Max Enrollment -->
					<div>
						<label for="create-max-enrollment" class="block text-sm font-medium text-gray-700"
							>Max Enrollment <span class="text-red-500">*</span></label
						>
						<input
							id="create-max-enrollment"
							type="number"
							min="1"
							max="500"
							bind:value={createForm.maxEnrollment}
							class="{inputCls} {createErrors.maxEnrollment ? 'border-red-400' : ''}"
							aria-required="true"
							aria-invalid={createErrors.maxEnrollment ? 'true' : 'false'}
							aria-describedby={createErrors.maxEnrollment
								? 'create-max-enrollment-error'
								: undefined}
						/>
						{#if createErrors.maxEnrollment}<p id="create-max-enrollment-error" class={errorCls}>
								{createErrors.maxEnrollment}
							</p>{/if}
					</div>

					<!-- Instructor Selection -->
					<fieldset>
						<legend class="mb-2 block text-sm font-medium text-gray-700">
							Assign Instructors
							<span class="ml-1 text-xs font-normal text-gray-400">(optional)</span>
						</legend>

						<!-- Instructor search -->
						<div class="relative mb-2">
							<label for="create-instructor-search" class="sr-only">Search instructors</label>
							<Search size={14} class="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" />
							<input
								id="create-instructor-search"
								type="text"
								bind:value={instructorSearchQuery}
								placeholder="Search instructors…"
								class="w-full rounded-lg border border-gray-300 py-2 pr-3 pl-8 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
							/>
						</div>

						<div
							class="max-h-52 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200"
						>
							{#each filteredInstructors() as instructor, i}
								<label
									class="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-gray-50"
								>
									<input
										type="checkbox"
										checked={createForm.instructorIds.includes(instructor.id)}
										onchange={() => toggleInstructorCreate(instructor.id)}
										class="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
									/>
									<div
										class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br {avatarColor(
											i
										)} text-xs font-bold text-white"
									>
										{avatar(instructor.firstName, instructor.lastName)}
									</div>
									<div class="min-w-0">
										<p class="truncate text-sm font-medium text-gray-900">
											{instructor.firstName}
											{instructor.lastName}
										</p>
										<p class="truncate text-xs text-gray-500">{instructor.email}</p>
									</div>
									{#if createForm.instructorIds.includes(instructor.id)}
										<CheckCircle size={16} class="ml-auto shrink-0 text-pink-600" />
									{/if}
								</label>
							{:else}
								<p class="px-4 py-3 text-sm text-gray-500">
									{availableInstructors.length === 0
										? 'No instructors in the system'
										: 'No results found'}
								</p>
							{/each}
						</div>
						{#if createForm.instructorIds.length > 0}
							<p class="mt-1.5 text-xs font-medium text-pink-600">
								{createForm.instructorIds.length} instructor(s) selected
							</p>
						{/if}
					</fieldset>

					<!-- Submit -->
					<div class="flex justify-end gap-3 border-t border-gray-100 pt-2">
						<button
							type="button"
							onclick={() => onTabChange('all')}
							class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
							>Cancel</button
						>
						<button
							type="submit"
							disabled={createLoading}
							class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-pink-700 disabled:opacity-60"
						>
							{#if createLoading}<RefreshCw size={16} class="animate-spin" />{/if}
							Create Class Code
						</button>
					</div>
				</form>
			</div>
		</div>

		<!-- ── ASSIGN STUDENTS TAB ─────────────────────────────────────────────── -->
	{:else if activeTab === 'assign'}
		<div class="mx-auto max-w-4xl space-y-4">
			<!-- Class selector -->
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
				<label for="assign-class-select" class="mb-2 block text-sm font-semibold text-gray-700"
					>Select Class to Manage Roster</label
				>
				<select
					id="assign-class-select"
					bind:value={assignClassSelectId}
					onchange={() => selectClassForAssign(assignClassSelectId)}
					class="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
				>
					<option value="">Choose a class…</option>
					{#each classCodes as cc}
						<option value={cc.id}>{cc.code} — {cc.courseName} ({cc.semester})</option>
					{/each}
				</select>
			</div>

			{#if assignedClassDetail}
				<!-- Class info banner -->
				<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
					<div class="flex flex-wrap items-center gap-4">
						<div class="min-w-0 flex-1">
							<p class="font-mono text-lg font-bold text-gray-900">{assignedClassDetail.code}</p>
							<p class="text-sm text-gray-600">{assignedClassDetail.courseName}</p>
						</div>
						<div class="flex items-center gap-6 text-sm">
							<div class="text-center">
								<p
									class="text-2xl font-bold {getEnrollmentTextColor(
										getEnrollmentPct(
											assignedClassDetail.studentCount,
											assignedClassDetail.maxEnrollment
										)
									)}"
								>
									{assignedClassDetail.studentCount}
								</p>
								<p class="text-xs text-gray-500">Enrolled</p>
							</div>
							<div class="text-center">
								<p class="text-2xl font-bold text-gray-400">{assignedClassDetail.maxEnrollment}</p>
								<p class="text-xs text-gray-500">Capacity</p>
							</div>
							<div class="text-center">
								<p class="text-2xl font-bold text-gray-900">
									{assignedClassDetail.maxEnrollment - assignedClassDetail.studentCount}
								</p>
								<p class="text-xs text-gray-500">Slots left</p>
							</div>
						</div>
					</div>
					<!-- Capacity bar -->
					<div class="mt-4">
						<div class="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
							<div
								class="h-2.5 rounded-full transition-all duration-500 {getEnrollmentColor(
									getEnrollmentPct(
										assignedClassDetail.studentCount,
										assignedClassDetail.maxEnrollment
									)
								)}"
								style="width: {getEnrollmentPct(
									assignedClassDetail.studentCount,
									assignedClassDetail.maxEnrollment
								)}%"
							></div>
						</div>
					</div>
				</div>

				<!-- Student search & list -->
				<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
					<div class="border-b border-gray-200 px-5 py-4">
						<div class="flex items-center justify-between gap-3">
							<p class="font-semibold text-gray-900">All Students</p>
							<div class="relative max-w-xs flex-1">
								<label for="assign-student-search" class="sr-only">Search students</label>
								<Search size={14} class="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" />
								<input
									id="assign-student-search"
									type="text"
									bind:value={studentSearchQuery}
									placeholder="Search students…"
									class="w-full rounded-lg border border-gray-300 py-1.5 pr-3 pl-8 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
								/>
							</div>
						</div>
					</div>

					<div class="max-h-[500px] divide-y divide-gray-100 overflow-y-auto">
						{#each filteredStudents() as student, i}
							{@const isEnrolled = enrolledStudentIds().has(student.id)}
							<div class="flex items-center gap-4 px-5 py-3 transition hover:bg-gray-50">
								<!-- Avatar -->
								<div
									class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br {avatarColor(
										i
									)} text-sm font-bold text-white"
								>
									{avatar(student.firstName, student.lastName)}
								</div>
								<!-- Info -->
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium text-gray-900">
										{student.firstName}
										{student.lastName}
									</p>
									<p class="truncate text-xs text-gray-500">{student.email}</p>
								</div>
								<!-- Meta badges -->
								<div class="hidden items-center gap-2 sm:flex">
									{#if student.yearLevel}
										<span
											class="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
											>{student.yearLevel}</span
										>
									{/if}
									{#if student.block}
										<span
											class="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
											>Block {student.block}</span
										>
									{/if}
								</div>
								<!-- Enroll / Unenroll -->
								<button
									onclick={() =>
										isEnrolled ? handleUnenroll(student.id) : handleEnroll(student.id)}
									disabled={assignLoading}
									class="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50
										{isEnrolled
										? 'border border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
										: 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}"
								>
									{isEnrolled ? 'Remove' : 'Enroll'}
								</button>
							</div>
						{:else}
							<div class="flex flex-col items-center justify-center py-12 text-center">
								<GraduationCap size={36} class="text-gray-200 mb-3" />
								<p class="text-sm text-gray-500">
									{availableStudents.length === 0
										? 'No students in the system'
										: 'No students match your search'}
								</p>
							</div>
						{/each}
					</div>
				</div>
			{:else if !assignClassSelectId}
				<div class="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-12 text-center">
					<UsersIcon size={40} class="mx-auto mb-3 text-gray-200" />
					<p class="text-sm font-medium text-gray-500">
						Select a class above to manage its student roster
					</p>
				</div>
			{/if}
		</div>

		<!-- ── ARCHIVED CLASSES TAB ────────────────────────────────────────────── -->
	{:else if activeTab === 'archived'}
		{#if archivedLoading}
			<div class="flex items-center justify-center py-20">
				<div class="flex items-center gap-3 text-gray-500">
					<RefreshCw size={22} class="animate-spin text-pink-500" />
					<span class="text-sm font-medium">Loading archived classes…</span>
				</div>
			</div>
		{:else if archivedCodes.length === 0}
			<div
				class="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-20 text-center shadow-sm"
			>
				<Archive size={48} class="mb-4 text-gray-200" />
				<p class="text-base font-semibold text-gray-900">No Archived Classes</p>
				<p class="mt-1 text-sm text-gray-500">
					Archived classes from previous semesters will appear here
				</p>
			</div>
		{:else}
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each archivedCodes as cc (cc.id)}
					<div
						class="group flex flex-col rounded-xl border border-gray-200 bg-gray-50 p-5 opacity-80 shadow-sm transition-all hover:opacity-100 hover:shadow-md"
					>
						<div class="flex items-start justify-between">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<Archive size={16} class="shrink-0 text-gray-400" />
									<h3 class="truncate font-mono text-sm font-bold text-gray-700">{cc.code}</h3>
								</div>
								<p class="mt-0.5 truncate text-sm text-gray-500">{cc.courseName}</p>
							</div>
							<span
								class="inline-flex rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600"
								>Archived</span
							>
						</div>

						<div class="mt-3 space-y-1.5 text-sm">
							<div class="flex items-center justify-between">
								<span class="text-gray-400">Semester</span>
								<span class="font-medium text-gray-600">{cc.semester}</span>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-gray-400">Academic Year</span>
								<span class="font-medium text-gray-600">{cc.academicYear}</span>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-gray-400">Final Enrollment</span>
								<span class="font-medium text-gray-600">{cc.studentCount}/{cc.maxEnrollment}</span>
							</div>
						</div>

						<div class="mt-4 flex gap-2">
							<button
								onclick={() => handleUnarchive(cc)}
								class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-emerald-300 hover:bg-white hover:text-emerald-700"
							>
								<ArchiveRestore size={14} /> Restore
							</button>
							<button
								onclick={() => handleDelete(cc)}
								class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100"
							>
								<Trash2 size={14} /> Delete
							</button>
						</div>
					</div>
				{/each}
			</div>

			<!-- Archived Pagination -->
			{#if archivedPagination.totalPages > 1}
				<div
					class="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-6 py-4 shadow-sm"
				>
					<p class="text-sm text-gray-500">
						{archivedPagination.total} archived class(es)
					</p>
					<div class="flex gap-2">
						<button
							onclick={() => {
								archivedPagination.page -= 1;
								loadArchived();
							}}
							disabled={archivedPagination.page <= 1}
							class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
							>Previous</button
						>
						<button
							onclick={() => {
								archivedPagination.page += 1;
								loadArchived();
							}}
							disabled={archivedPagination.page >= archivedPagination.totalPages}
							class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
							>Next</button
						>
					</div>
				</div>
			{/if}
		{/if}
	{/if}
</div>
