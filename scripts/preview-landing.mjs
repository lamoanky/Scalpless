// Kept as the quick local entry point; the check also captures all key states.
process.env.PREVIEW_URL ||= 'http://127.0.0.1:5173/';
await import('./check-landing.mjs');
