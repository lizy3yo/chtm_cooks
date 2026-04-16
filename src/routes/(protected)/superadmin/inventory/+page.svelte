<script lang="ts">
	import { Package, TrendingUp, AlertCircle, Info } from 'lucide-svelte';

	let activeTab = $state<'stock' | 'usage' | 'obligations'>('stock');
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-4">
		<div class="flex-1">
			<h1 class="text-2xl font-bold text-gray-900">Inventory Overview</h1>
			<p class="mt-1 text-sm text-gray-500">Read-only view of equipment inventory and usage statistics</p>
			
			<div class="mt-4 flex items-start gap-3 rounded-lg border border-pink-200 bg-pink-50 p-4">
				<Info size={20} class="mt-0.5 shrink-0 text-pink-600" />
				<div class="flex-1 text-sm">
					<p class="font-medium text-pink-900">Inventory Monitoring Features</p>
					<ul class="mt-2 space-y-1 text-pink-800">
						<li>• Monitor stock levels and low inventory alerts across all equipment</li>
						<li>• View usage statistics and most borrowed items by category</li>
						<li>• Track replacement obligations for damaged or missing equipment</li>
						<li>• Analyze inventory turnover and utilization rates</li>
						<li>• Generate reports on equipment lifecycle and maintenance needs</li>
					</ul>
				</div>
			</div>
		</div>
	</div>

	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-6">
			<button onclick={() => activeTab = 'stock'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'stock' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">Stock Levels</button>
			<button onclick={() => activeTab = 'usage'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'usage' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">Usage Statistics</button>
			<button onclick={() => activeTab = 'obligations'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'obligations' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">Replacement Obligations</button>
		</nav>
	</div>

	<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
		<p class="text-center text-gray-500">Inventory data will be displayed here</p>
	</div>
</div>
