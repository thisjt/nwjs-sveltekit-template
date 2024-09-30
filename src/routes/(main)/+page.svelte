<script>
	import { onMount } from 'svelte';
	let hello = 'sad';

	onMount(() => {
		fetch('/api')
			.then((data) => data.json())
			.then((data) => {
				hello = data.hello;
			});
	});
</script>

<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://kit.svelte.dev">kit.svelte.dev</a> to read the documentation</p>
<p>Hello {hello}</p>
