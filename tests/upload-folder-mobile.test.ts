/**
 * Folder upload on mobile.
 *
 * The upload panel offered "Subir carpeta" on every device, but the button
 * is a `<input type="file" webkitdirectory>` and no mobile browser can pick
 * a directory with it — iOS Safari/Chrome ignore the attribute outright and
 * Android's document picker only ever returns files. The button therefore
 * opened a plain file picker, which is exactly what the user reported: on
 * the phone you can only choose a file, never a folder.
 *
 * The panel now feature-detects the directory picker and, where it cannot
 * work, offers the path that already exists end to end instead — a .zip,
 * which `sessions.ts` expands server-side into the individual invoices.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { get } from 'svelte/store';
import { locale, t, loadAllMessages } from '../src/lib/i18n';
import { isTouchFirstDevice, supportsDirectoryPicker } from '../src/lib/upload-capabilities';
import { SUPPORTED_UPLOAD_EXTENSIONS, ZIP_UPLOAD_ACCEPT } from '../src/lib/upload-formats';

await loadAllMessages();

const ROOT = path.resolve(__dirname, '..');
const PANEL = readFileSync(path.join(ROOT, 'src/lib/components/UploadPanel.svelte'), 'utf8');

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_LEGACY = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_CLASS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const WINDOWS_FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0';

describe('directory picker support detection', () => {
	it.each([
		['iPhone Safari', IPHONE, 0],
		['iPad Safari', IPAD_LEGACY, 5],
		['iPadOS desktop-class Safari', IPAD_DESKTOP_CLASS, 5],
		['Android Chrome', ANDROID_CHROME, 5],
	])('treats %s as unable to pick a folder even though the attribute exists', (_label, userAgent, maxTouchPoints) => {
		expect(isTouchFirstDevice(userAgent, maxTouchPoints)).toBe(true);
		expect(supportsDirectoryPicker({ hasWebkitDirectory: true, userAgent, maxTouchPoints })).toBe(false);
	});

	it.each([
		['macOS Chrome', MAC_CHROME],
		['Windows Firefox', WINDOWS_FIREFOX],
	])('keeps the folder picker on %s', (_label, userAgent) => {
		expect(isTouchFirstDevice(userAgent, 0)).toBe(false);
		expect(supportsDirectoryPicker({ hasWebkitDirectory: true, userAgent, maxTouchPoints: 0 })).toBe(true);
	});

	it('a touch-capable desktop Mac is not mistaken for an iPad when it reports no touch points', () => {
		expect(supportsDirectoryPicker({ hasWebkitDirectory: true, userAgent: IPAD_DESKTOP_CLASS, maxTouchPoints: 0 })).toBe(true);
	});

	it('refuses the folder picker when the browser lacks the attribute at all', () => {
		expect(supportsDirectoryPicker({ hasWebkitDirectory: false, userAgent: MAC_CHROME, maxTouchPoints: 0 })).toBe(false);
	});
});

describe('the zip fallback is a real upload path', () => {
	it('offers a file type the upload pipeline already accepts', () => {
		expect(SUPPORTED_UPLOAD_EXTENSIONS).toContain('.zip');
		expect(ZIP_UPLOAD_ACCEPT).toContain('.zip');
	});

	it('names zip MIME types too, since Android pickers filter on MIME, not extension', () => {
		expect(ZIP_UPLOAD_ACCEPT).toContain('application/zip');
	});
});

describe('UploadPanel wiring', () => {
	it('routes both layouts through the picker that knows what the device supports', () => {
		expect(PANEL).not.toMatch(/onclick=\{\(e\) => \{ e\.stopPropagation\(\); folderInputEl\?\.click\(\); \}\}/);
		expect(PANEL.match(/openFolderPicker\(\)/g)?.length).toBe(3);
	});

	it('labels the button for what it will actually open', () => {
		expect(PANEL).toMatch(/canPickFolder \? \$t\('upload\.browseFolder'\) : \$t\('upload\.browseZip'\)/);
	});

	it('keeps one element per hidden input, not one per responsive variant', () => {
		for (const binding of ['fileInputEl', 'folderInputEl', 'zipInputEl', 'cameraInputEl']) {
			expect(PANEL.match(new RegExp(`bind:this=\\{${binding}\\}`, 'g'))?.length, binding).toBe(1);
		}
	});

	it('defaults to the folder picker so desktop never flashes the zip label', () => {
		expect(PANEL).toMatch(/let canPickFolder = \$state\(true\);/);
	});
});

describe('copy', () => {
	it.each(['es', 'en'] as const)('resolves the zip fallback strings in %s', (lang) => {
		locale.set(lang);
		const translate = get(t);
		for (const key of ['upload.browseZip', 'upload.folderZipHint']) {
			expect(translate(key), key).not.toBe(key);
			expect(translate(key).length).toBeGreaterThan(0);
		}
	});
});
