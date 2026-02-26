<script lang="ts">
	import { getPasswordStrength } from '$lib/utils/validation';
	
	interface Props {
		password: string;
		show?: boolean;
	}
	
	let { password, show = true }: Props = $props();
	
	const strength = $derived(getPasswordStrength(password));
	const percentage = $derived((strength.score / 4) * 100);
</script>

{#if show && password}
	<div class="mt-2">
		<div class="mb-1 flex items-center justify-between">
			<span class="text-xs font-medium text-gray-700">Password Strength:</span>
			<span class="text-xs font-semibold" style="color: {strength.color}">
				{strength.label}
			</span>
		</div>
		<div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
			<div
				class="h-full transition-all duration-300 ease-out"
				style="width: {percentage}%; background-color: {strength.color}"
			></div>
		</div>
		<div class="mt-2 space-y-1">
			<p class="text-xs text-gray-600">Password must contain:</p>
			<ul class="space-y-0.5 text-xs">
				<li class="flex items-center {password.length >= 8 ? 'text-green-600' : 'text-gray-500'}">
					<svg class="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
					</svg>
					At least 8 characters
				</li>
				<li class="flex items-center {/[A-Z]/.test(password) ? 'text-green-600' : 'text-gray-500'}">
					<svg class="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
					</svg>
					One uppercase letter
				</li>
				<li class="flex items-center {/[a-z]/.test(password) ? 'text-green-600' : 'text-gray-500'}">
					<svg class="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
					</svg>
					One lowercase letter
				</li>
				<li class="flex items-center {/[0-9]/.test(password) ? 'text-green-600' : 'text-gray-500'}">
					<svg class="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
					</svg>
					One number
				</li>
				<li class="flex items-center {/[!@#$%^&*(),.?":{}|<>]/.test(password) ? 'text-green-600' : 'text-gray-500'}">
					<svg class="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
					</svg>
					One special character
				</li>
			</ul>
		</div>
	</div>
{/if}
