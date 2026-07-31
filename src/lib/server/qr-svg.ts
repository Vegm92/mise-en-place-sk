import qrcode from 'qrcode-generator';

const ERROR_CORRECTION = 'M';

export function renderQrSvg(text: string): string | null {
	if (!text) return null;
	try {
		const qr = qrcode(0, ERROR_CORRECTION);
		qr.addData(text);
		qr.make();
		return qr.createSvgTag({ scalable: true, margin: 1 });
	} catch (err) {
		console.error('[qr-svg] failed to render QR code:', err);
		return null;
	}
}
