<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/auth';
	
	// This route is deprecated. Redirect to role-specific dashboards.
	onMount(() => {
		const role = $user?.role;
		
		if (role === 'student') {
			goto('/student/dashboard', { replaceState: true });
		} else if (role === 'instructor') {
			goto('/instructor/dashboard', { replaceState: true });
		} else if (role === 'custodian') {
			goto('/custodian/dashboard', { replaceState: true });
		} else if (role === 'superadmin') {
			goto('/admin/dashboard', { replaceState: true });
		} else {
			// Fallback to login if role is unknown
			goto('/auth/login', { replaceState: true });
		}
	});
</script>

<div class="flex items-center justify-center min-h-screen">
	<p class="text-gray-500">Redirecting...</p>
</div>

