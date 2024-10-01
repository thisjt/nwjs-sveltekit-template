import { browser } from '$app/environment';

// Gotcha: You need to use let, as we need to override it with the nwjs function
//         you made in "nw/functions". Functions are not allowed, we don't want
//         it to be hoisted as we need to overwrite the function

/**@type {Window['nwjs']['getSystemInformation']} */
let getSystemInformation = () => {
	return new Promise((res) => {
		setTimeout(() => {
			const data = `All I can do is userAgent ${navigator.userAgent}`;
			res(data);
		}, 1000);
	});
};

if (browser && window.nwjs?.getSystemInformation)
	getSystemInformation = window.nwjs.getSystemInformation;

export { getSystemInformation };
