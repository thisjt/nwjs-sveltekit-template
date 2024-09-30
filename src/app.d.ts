// Declare the types you have exported in "nw/functions" here so that
// your types in "lib/functions" and "nw/functions" will agree with
// each other
import { getSystemInformation } from '$nw/functions/systeminfo';

declare global {
	namespace App {}

	interface Window {
		nwjs: {
			getSystemInformation: typeof getSystemInformation;
		};
	}
}

export {};
