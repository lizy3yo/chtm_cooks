<script lang="ts">
	import { Key, Plus, Trash2, Info, Search } from 'lucide-svelte';

	let activeTab = $state<'active' | 'create' | 'revoked'>('active');
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-4">
		<div class="flex-1">
			<h1 class="text-2xl font-bold text-gray-900">Shortcut Key Management</h1>
			<p class="mt-1 text-sm text-gray-500">Manage authentication keys for staff members (instructors and custodians)</p>
			
			<div class="mt-4 flex items-start gap-3 rounded-lg border border-pink-200 bg-pink-50 p-4">
				<Info size={20} class="mt-0.5 shrink-0 text-pink-600" />
				<div class="flex-1 text-sm">
					<p class="font-medium text-pink-900">Shortcut Key Features</p>
					<ul class="mt-2 space-y-1 text-pink-800">
						<li>• Create secure authentication keys for instructors and custodians</li>
						<li>• Set optional expiration dates for temporary access</li>
						<li>• Track key usage: last used date, usage count, device fingerprint</li>
						<li>• Revoke keys instantly with reason tracking for audit compliance</li>
						<li>• Key types: STAFF (instructors/custodians) and SUPERADMIN</li>
						<li>• Device fingerprinting prevents unauthorized key sharing</li>
					</ul>
				</div>
			</div>
		</div>
	</div>

	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-6">
			<button onclick={() => activeTab = 'active'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'active' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">Active Keys</button>
			<button onclick={() => activeTab = 'create'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'create' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">Create Key</button>
			<button onclick={() => activeTab = 'revoked'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'revoked' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">Revoked Keys</button>
		</nav>
	</div>

	{#if activeTab === 'create'}
		<div class="mx-auto max-w-2xl">
			<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
				<h2 class="text-lg font-semibold text-gray-900">Create Shortcut Key</h2>
				<p class="mt-1 text-sm text-gray-500">Generate a new authentication key for a staff member</p>
				
				<form class="mt-6 space-y-4">
					<div>
						<label class="block text-sm font-medium text-gray-700">Select User</label>
						<select class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20">
							<option value="">Choose a user...</option>
							<option>Dr. Jane Smith (Instructor)</option>
							<option>Prof. John Doe (Instructor)</option>
							<option>Bob Johnson (Custodian)</option>
						</select>
					</div>
					
					<div>
						<label class="block text-sm font-medium text-gray-700">Key Type</label>
						<select class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20">
							<option value="STAFF">STAFF (Instructor/Custodian)</option>
							<option value="SUPERADMIN">SUPERADMIN</option>
						</select>
					</div>
					
					<div>
						<label class="block text-sm font-medium text-gray-700">Expiration (Optional)</label>
						<input type="date" class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20" />
						<p class="mt-1 text-xs text-gray-500">Leave empty for no expiration</p>
					</div>
					
					<div class="flex justify-end gap-3 pt-4">
						<button type="button" onclick={() => activeTab = 'active'} class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
						<button type="submit" class="rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700">Generate Key</button>
					</div>
				</form>
			</div>
		</div>
	{:else}
		<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
			<p class="text-center text-gray-500">{activeTab === 'active' ? 'Active' : 'Revoked'} shortcut keys will be displayed here</p>
		</div>
	{/if}
</div>
