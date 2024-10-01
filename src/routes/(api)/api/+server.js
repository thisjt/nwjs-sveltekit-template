import { json } from '@sveltejs/kit';
import { PRIVATE_STRING } from '$env/static/private';
import { PUBLIC_STRING } from '$env/static/public';

export async function GET() {
	return json({ hello: 'world', PUBLIC_STRING, PRIVATE_STRING });
}
