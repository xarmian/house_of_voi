<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import PlayerProfile from '$lib/components/PlayerProfile.svelte';

	$: address = $page.params.address;
</script>

<svelte:head>
	<title>Player Profile: {address} - House of Voi</title>
	<meta name="description" content="View {address}'s gaming statistics and history on House of Voi" />
</svelte:head>

<PlayerProfile {address} />