# NWJS SvelteKit Template

Template for building desktop applications using SvelteKit and NWJS, includes an API SvelteKit Endpoint using @yao-pkg/pkg.

## How to install

Download this repo, then do:

`pnpm install`

After installing, split your command prompt into two and run these commands on each consoles:

| Console 1  | Console 2 |
| ---------- | --------- |
| `pnpm dev` | `pnpm nw` |

The reason these are split into two is so that you can terminate `nw` without terminating the vite server. During
your development of `nw`.

## Project Structure

Inside the `src` folder, you will see a new folder named `nw`. NWJS will be run in this folder as you can see
in `package.json > scripts`. Keep in mind that Hot Module Replacement (HMR) or Hot Reloading does not work
for NWJS, so you will need to close and reopen it every time you change something inside the `nw` folder.

On the other hand, `src/routes` folder will behave exactly the same as how SvelteKit has designed it, with a
few key things to keep in mind. Make sure to keep the folder `routes` clear from any other files other than the
folders `(api)` and `(main)`, as this is what is configured in `vite.config.js` to compile to an API Endpoint
and Static Site respectively.

The `(main)` folder will be treated statically as indicated by `+layout.js` exporting the code

```js
export const prerender = true;
```

Do your Frontend things here.

If you need to reach out to the backend API endpoint, make use of `fetch` in the frontend.

```js
fetch('/api')
	.then((data) => data.json())
	.then((data) => {
		hello = data.hello;
	});
```

During build time, the builder will replace `/api` to `https://localhost:{PORT}/api`.

## Building the Desktop Application

If you are done, and want to build the application, you can run the command `pnpm build:all`. This will build
the entire desktop application in the `dist` folder.

## Things to Keep in Mind

### NWJS Context and Browser Context

Functions created in NWJS context must be accompanied by its corresponding browser context function. For example:

NWJS Context Function:

```js
// src/nw/functions/systeminfo.js
const si = require('systeminformation');

/** @returns {Promise<string>} */
const getSystemInformation = async () => {
	return JSON.stringify(await si.get({ system: '*' }));
};

module.exports = {
	getSystemInformation
};
```

```js
// src/nw/index.js
const systeminfo = require('./functions/systeminfo');

nw.Window.open('http://localhost:5173', {}, (winMain) => {
	winMain.on('document-start', () => {
		// This is what injects the code into the NWJS browser
		// global "window" variable. Check browser context function
		// below on how this is consumed
		winMain.window.nwjs = {
			getSystemInformation: systeminfo.getSystemInformation
		};
	});
});
```

Browser Context Function:

```js
// src/lib/functions/systeminfo.js
import { browser } from '$app/environment';

/**@type {Window['nwjs']['getSystemInformation']} */
let getSystemInformation = () => {
	return new Promise((res) => {
		setTimeout(() => {
			const data = `All I can do is userAgent ${navigator.userAgent}`;
			res(data);
		}, 1000);
	});
};

// This part is important, as this line is what makes your function
// available for consumption inside the NWJS browser window
if (browser && window.nwjs?.getSystemInformation)
	getSystemInformation = window.nwjs.getSystemInformation;

export { getSystemInformation };
```

Don't forget to add the types of the created function in `src/app.d.ts`. Preferably the
source of truth for your type should be the NWJS context function, but that ultimately depends
on how you will structure your code.

```ts
// src/app.d.ts
import { getSystemInformation } from '$nw/functions/systeminfo';

declare global {
	namespace App {}

	interface Window {
		nwjs: {
			getSystemInformation: typeof getSystemInformation;
		};
	}
}
```

You can now use this function in the frontend inside SvelteKit

```html
<script>
	import { getSystemInformation } from '$lib/functions/systeminfo';
	import { onMount } from 'svelte';

	let systemInfo = 'Loading...';

	onMount(() => {
		getSystemInformation().then((data) => {
			systemInfo = data;
		});
	});
</script>

<p>System Info: {systemInfo}</p>
```

If you encounter any issues, feel free to open a bug report in this repo. You can also
open PRs for contributions.
