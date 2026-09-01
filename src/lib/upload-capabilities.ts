export interface DirectoryPickerEnv {
	hasWebkitDirectory: boolean;
	userAgent: string;
	maxTouchPoints: number;
}

const MOBILE_USER_AGENT = /Android|iPhone|iPod|iPad|Windows Phone|IEMobile|BlackBerry|BB10|webOS|Opera Mini|Mobile Safari|Silk/i;

export function isTouchFirstDevice(userAgent: string, maxTouchPoints: number): boolean {
	if (MOBILE_USER_AGENT.test(userAgent)) return true;
	return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

export function supportsDirectoryPicker(env: DirectoryPickerEnv): boolean {
	if (!env.hasWebkitDirectory) return false;
	return !isTouchFirstDevice(env.userAgent, env.maxTouchPoints);
}

export function detectDirectoryPickerSupport(): boolean {
	if (typeof document === 'undefined' || typeof navigator === 'undefined') return false;
	return supportsDirectoryPicker({
		hasWebkitDirectory: 'webkitdirectory' in document.createElement('input'),
		userAgent: navigator.userAgent,
		maxTouchPoints: navigator.maxTouchPoints ?? 0,
	});
}
