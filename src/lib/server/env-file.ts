try {
	process.loadEnvFile();
} catch (e) {
	if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
}
