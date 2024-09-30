<script>
	import { getSystemInformation } from '$lib/functions/systeminfo';
	import { onMount } from 'svelte';
	let hello = 'sad';

	let systemInfo = 'Loading... might not resolve at all!';

	onMount(() => {
		fetch('/api')
			.then((data) => data.json())
			.then((data) => {
				hello = data.hello;
			});

		getSystemInformation().then((data) => {
			systemInfo = data;
		});
	});
</script>

<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://kit.svelte.dev">kit.svelte.dev</a> to read the documentation</p>
<p>Hello {hello}</p>
<p>System Info: {systemInfo}</p>
