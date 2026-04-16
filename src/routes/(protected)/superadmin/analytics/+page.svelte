<script lang="ts">
	import { BarChart3, Users, ClipboardList, GraduationCap, FileText, Info } from 'lucide-svelte';

	let activeTab = $state<'system' | 'users' | 'requests' | 'classes' | 'custom'>('system');
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-4">
		<div class="flex-1">
			<h1 class="text-2xl font-bold text-gray-900">Analytics & Reports</h1>
			<p class="mt-1 text-sm text-gray-500">Comprehensive insights and data visualization across the system</p>
			
			<div class="mt-4 flex items-start gap-3 rounded-lg border border-pink-200 bg-pink-50 p-4">
				<Info size={20} class="mt-0.5 shrink-0 text-pink-600" />
				<div class="flex-1 text-sm">
					<p class="font-medium text-pink-900">Analytics Capabilities</p>
					<ul class="mt-2 space-y-1 text-pink-800">
						<li>• System-wide KPIs: user growth, request volume, approval rates, system health</li>
						<li>• User analytics: activity patterns, trust scores, most active students/instructors</li>
						<li>• Request analytics: turnaround times, approval rates by instructor, peak usage periods</li>
						<li>• Class performance: equipment usage by class, request patterns, instructor efficiency</li>
						<li>• Custom report builder with date ranges, filters, and export options</li>
						<li>• Trend analysis and forecasting for capacity planning</li>
					</ul>
				</div>
			</div>
		</div>
	</div>

	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-6">
			<button onclick={() => activeTab = 'system'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'system' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">System Overview</button>
			<button onclick={() => activeTab = 'users'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'users' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">User Analytics</button>
			<button onclick={() => activeTab = 'requests'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'requests' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">Request Analytics</button>
			<button onclick={() => activeTab = 'classes'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'classes' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">Class Performance</button>
			<button onclick={() => activeTab = 'custom'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'custom' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">Custom Reports</button>
		</nav>
	</div>

	<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
		<p class="text-center text-gray-500">Analytics data will be displayed here</p>
	</div>
</div>
