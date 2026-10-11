// Keep the old hollow accessible for comparison without changing its save.
if (new URLSearchParams(location.search).has('hollow')) await import('./main.ts');
else await import('../wisp/main.ts');
