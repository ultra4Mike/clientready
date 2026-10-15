import qrcode from "qrcode-generator";
import { safePayUrl } from "@/lib/pay-link";

const QUIET = 4; // modules of white margin required by the QR spec

/** "Scan to pay" QR. Always black on white (inline fills, so dark mode and print cannot recolor it). */
export default function PayQr({ url, size = 128 }: { url: string; size?: number }) {
  const safe = safePayUrl(url);
  if (!safe) return null;
  let path = "";
  let count = 0;
  try {
    const qr = qrcode(0, "M");
    qr.addData(safe);
    qr.make();
    count = qr.getModuleCount();
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) path += `M${col + QUIET} ${row + QUIET}h1v1h-1z`;
      }
    }
  } catch {
    return null;
  }
  const box = count + QUIET * 2;
  return (
    <div className="mt-6 flex items-center gap-4" data-testid="pay-qr">
      <svg
        role="img"
        aria-label={`QR code for ${safe}`}
        width={size}
        height={size}
        viewBox={`0 0 ${box} ${box}`}
        shapeRendering="crispEdges"
        style={{ background: "#ffffff", flex: "none" }}
      >
        <rect width={box} height={box} fill="#ffffff" />
        <path d={path} fill="#000000" />
      </svg>
      <div className="min-w-0">
        <p className="font-semibold">Scan to pay</p>
        <p className="break-all text-xs opacity-80">{safe}</p>
      </div>
    </div>
  );
}
