import QRCode from "qrcode";

/** QR code as an SVG string (server-side). Medium error correction survives a little wear and grease. */
export function qrSvg(text: string) {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111418", light: "#ffffff" } });
}
