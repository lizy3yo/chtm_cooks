<script lang="ts">
	import { Search, Plus, Archive, Users as UsersIcon, BookOpen, Calendar, Info, Edit, Trash2, MoreVertical } from 'lucide-svelte';

	// State management
	let activeTab = $state<'all' | 'create' | 'assign' | 'archived'>('all');
	let searchQuery = $state('');
	let selectedSemester = $state('all');
	let selectedYear = $state('all');

	// Mock data
	let classCodes = $state([
		{ 
			id: 1, 
			code: '2026-CHTM101-A', 
			courseName: 'Culinary Arts Fundamentals', 
			courseCode: 'CHTM101',
			section: 'A',
			academicYear: '2025-2026',
			semester: 'First',
			instructors: ['Dr. Jane Smith', 'Prof. John Doe'],
			studentCount: 35,
			maxEnrollment: 40,
			isActive: true,
			createdAt: '2026-01-15'
		},
		{ 
			id: 2, 
			code: '2026-CHTM101-B', 
			courseName: 'Culinary Arts Fundamentals', 
			courseCode: 'CHTM101',
			section: 'B',
			academicYear: '2025-2026',
			semester: 'First',
			instructors: ['Prof. Alice Johnson'],
			studentCount: 38,
			maxEnrollment: 40,
			isActive: true,
			createdAt: '2026-01-15'
		},
		{ 
			id: 3, 
			code: '2026-CHTM201-A', 
			courseName: 'Advanced Food Preparation', 
			courseCode: 'CHTM201',
			section: 'A',
			academicYear: '2025-2026',
			semester: 'First',
			instructors: ['Chef Robert Brown'],
			studentCount: 28,
			maxEnrollment: 30,
			isActive: true,
			createdAt: '2026-01-15'
		}
	]);

	let stats = $state({
		totalClasses: 45,
		activeClasses: 42,
		archivedClasses: 3,
		totalStudents: 1050,
		avgClassSize: 25,
		totalInstructors: 18
	});

	function getSemesterBadgeColor(semester: string): string {
		const colors: Record<string, string> = {
			'First': 'bg-blue-100 text-blue-800',
			'Second': 'bg-purple-100 text-purple-800',
			'Summer': 'bg-amber-100 text-amber-800'
		};
		return colors[semester] || 'bg-gray-100 text-gray-800';
	}

	function getEnrollmentColor(current: number, max: number): string {
		const percentage = (current / max) * 100;
		if (percentage >= 90) return 'text-red-600';
		if (percentage >= 75) return 'text-amber-600';
		return 'text-emerald-600';
	}
</script>

<div class="space-y-6">
	<!-- Header with Info -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div class="flex-1">
			<h1 class="text-2xl font-bold text-gray-900">Class Code Management</h1>
			<p class="mt-1 text-sm text-gray-500">Organize students and instructors by academic classes and sections</p>
			
			<!-- Info Banner -->
			<div class="mt-4 flex items-start gap-3 rounded-lg border border-pink-200 bg-pink-50 p-4">
				<Info size={20} class="mt-0.5 shrink-0 text-pink-600" />
				<div class="flex-1 text-sm">
					<p class="font-medium text-pink-900">Class Code System Features</p>
					<ul class="mt-2 space-y-1 text-pink-800">
						<li>• Create and manage class codes with format: [YEAR]-[COURSE]-[SECTION] (e.g., 2026-CHTM101-A)</li>
						<li>• Assign multiple instructors to teach the same class section</li>
						<li>• Enroll students in classes for organized request routing and analytics</li>
						<li>• Track enrollment capacity and class roster in real-time</li>
						<li>• Archive classes at semester end while preserving historical data</li>
						<li>• Generate class performance reports and equipment usage by class</li>
					</ul>
				</div>
			</div>
		</div>
	</div>

	<!-- Tabs -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-6">
			<button
				onclick={() => activeTab = 'all'}
				class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'all'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				All Classes
			</button>
			<button
				onclick={() => activeTab = 'create'}
				class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'create'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Create Class
			</button>
			<button
				onclick={() => activeTab = 'assign'}
				class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'assign'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Assign Students
			</button>
			<button
				onclick={() => activeTab = 'archived'}
				class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'archived'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Archived Classes
			</button>
		</nav>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'all'}
		<!-- Stats -->
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
				<p class="text-sm font-medium text-gray-500">Total Classes</p>
				<p class="mt-2 text-3xl font-bold text-gray-900">{stats.totalClasses}</p>
				<p class="mt-1 text-xs text-gray-500">Active this semester</p>
			</div>
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
				<p class="text-sm font-medium text-gray-500">Total Students</p>
				<p class="mt-2 text-3xl font-bold text-pink-600">{stats.totalStudents.toLocaleString()}</p>
				<p class="mt-1 text-xs text-gray-500">Enrolled across all classes</p>
			</div>
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
				<p class="text-sm font-medium text-gray-500">Avg Class Size</p>
				<p class="mt-2 text-3xl font-bold text-purple-600">{stats.avgClassSize}</p>
				<p class="mt-1 text-xs text-gray-500">Students per class</p>
			</div>
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
				<p class="text-sm font-medium text-gray-500">Instructors</p>
				<p class="mt-2 text-3xl font-bold text-blue-600">{stats.totalInstructors}</p>
				<p class="mt-1 text-xs text-gray-500">Teaching this semester</p>
			</div>
		</div>

		<!-- Filters and Actions -->
		<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div class="grid flex-1 gap-4 sm:grid-cols-3">
					<!-- Search -->
					<div class="relative">
						<Search size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
						<input
							type="text"
							bind:value={searchQuery}
							placeholder="Search classes..."
							class="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
						/>
					</div>

					<!-- Semester Filter -->
					<select
						bind:value={selectedSemester}
						class="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
					>
						<option value="all">All Semesters</option>
						<option value="first">First Semester</option>
						<option value="second">Second Semester</option>
						<option value="summer">Summer</option>
					</select>

					<!-- Year Filter -->
					<select
						bind:value={selectedYear}
						class="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
					>
						<option value="all">All Years</option>
						<option value="2025-2026">2025-2026</option>
						<option value="2024-2025">2024-2025</option>
					</select>
				</div>

				<button
					onclick={() => activeTab = 'create'}
					class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-pink-700"
				>
					<Plus size={18} />
					Create Class
				</button>
			</div>
		</div>

		<!-- Classes Grid -->
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each classCodes as classCode}
				<div class="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-pink-300 hover:shadow-md">
					<div class="flex items-start justify-between">
						<div class="flex-1">
							<div class="flex items-center gap-2">
								<BookOpen size={20} class="text-pink-600" />
								<h3 class="font-semibold text-gray-900">{classCode.code}</h3>
							</div>
							<p class="mt-1 text-sm text-gray-600">{classCode.courseName}</p>
						</div>
						<button class="rounded-lg p-1.5 text-gray-400 opacity-0 transition-all hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100">
							<MoreVertical size={18} />
						</button>
					</div>

					<div class="mt-4 space-y-2">
						<div class="flex items-center justify-between text-sm">
							<span class="text-gray-500">Semester:</span>
							<span class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold {getSemesterBadgeColor(classCode.semester)}">
								{classCode.semester}
							</span>
						</div>
						<div class="flex items-center justify-between text-sm">
							<span class="text-gray-500">Academic Year:</span>
							<span class="font-medium text-gray-900">{classCode.academicYear}</span>
						</div>
						<div class="flex items-center justify-between text-sm">
							<span class="text-gray-500">Enrollment:</span>
							<span class="font-medium {getEnrollmentColor(classCode.studentCount, classCode.maxEnrollment)}">
								{classCode.studentCount}/{classCode.maxEnrollment}
							</span>
						</div>
					</div>

					<div class="mt-4 border-t border-gray-200 pt-4">
						<p class="text-xs font-medium text-gray-500">Instructors:</p>
						<div class="mt-2 flex flex-wrap gap-1">
							{#each classCode.instructors as instructor}
								<span class="inline-flex items-center rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-800">
									{instructor}
								</span>
							{/each}
						</div>
					</div>

					<div class="mt-4 flex gap-2">
						<button class="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50">
							View Roster
						</button>
						<button class="flex-1 rounded-lg bg-pink-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-pink-700">
							Manage
						</button>
					</div>
				</div>
			{/each}
		</div>
	{:else if activeTab === 'create'}
		<div class="mx-auto max-w-2xl">
			<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
				<h2 class="text-lg font-semibold text-gray-900">Create New Class Code</h2>
				<p class="mt-1 text-sm text-gray-500">Set up a new class section for the academic term</p>
				
				<form class="mt-6 space-y-4">
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label class="block text-sm font-medium text-gray-700">Course Code</label>
							<input type="text" placeholder="e.g., CHTM101" class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20" />
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700">Section</label>
							<input type="text" placeholder="e.g., A" class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20" />
						</div>
					</div>
					
					<div>
						<label class="block text-sm font-medium text-gray-700">Course Name</label>
						<input type="text" placeholder="e.g., Culinary Arts Fundamentals" class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20" />
					</div>
					
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label class="block text-sm font-medium text-gray-700">Academic Year</label>
							<select class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20">
								<option value="2025-2026">2025-2026</option>
								<option value="2026-2027">2026-2027</option>
							</select>
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700">Semester</label>
							<select class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20">
								<option value="First">First Semester</option>
								<option value="Second">Second Semester</option>
								<option value="Summer">Summer</option>
							</select>
						</div>
					</div>
					
					<div>
						<label class="block text-sm font-medium text-gray-700">Max Enrollment</label>
						<input type="number" placeholder="40" class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20" />
					</div>
					
					<div>
						<label class="block text-sm font-medium text-gray-700">Assign Instructors</label>
						<select multiple class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20" size="4">
							<option>Dr. Jane Smith</option>
							<option>Prof. John Doe</option>
							<option>Prof. Alice Johnson</option>
							<option>Chef Robert Brown</option>
						</select>
						<p class="mt-1 text-xs text-gray-500">Hold Ctrl/Cmd to select multiple instructors</p>
					</div>
					
					<div class="flex justify-end gap-3 pt-4">
						<button type="button" onclick={() => activeTab = 'all'} class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
							Cancel
						</button>
						<button type="submit" class="rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700">
							Create Class Code
						</button>
					</div>
				</form>
			</div>
		</div>
	{:else if activeTab === 'assign'}
		<div class="mx-auto max-w-4xl">
			<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
				<h2 class="text-lg font-semibold text-gray-900">Assign Students to Class</h2>
				<p class="mt-1 text-sm text-gray-500">Enroll students in class sections for organized management</p>
				
				<div class="mt-6 space-y-4">
					<div>
						<label class="block text-sm font-medium text-gray-700">Select Class Code</label>
						<select class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20">
							<option value="">Choose a class...</option>
							<option>2026-CHTM101-A - Culinary Arts Fundamentals</option>
							<option>2026-CHTM101-B - Culinary Arts Fundamentals</option>
							<option>2026-CHTM201-A - Advanced Food Preparation</option>
						</select>
					</div>
					
					<div class="rounded-lg bg-blue-50 p-4">
						<p class="text-sm font-medium text-blue-900">Bulk Assignment Options</p>
						<div class="mt-3 flex gap-3">
							<button class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
								<UsersIcon size={16} />
								Select Students
							</button>
							<button class="inline-flex items-center gap-2 rounded-lg border border-blue-600 bg-white px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50">
								Import CSV
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	{:else if activeTab === 'archived'}
		<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
			<div class="flex items-center gap-3 text-gray-500">
				<Archive size={48} class="text-gray-300" />
				<div>
					<p class="font-medium text-gray-900">No Archived Classes</p>
					<p class="text-sm">Archived classes from previous semesters will appear here</p>
				</div>
			</div>
		</div>
	{/if}
</div>
