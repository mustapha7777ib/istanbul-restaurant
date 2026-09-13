// All amounts are integer kobo (₦1 = 100 kobo).

const wholeNaira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });
const nairaKobo = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 });

/** ₦6,500 for whole amounts, ₦17,737.50 when there are kobo. */
export function formatNaira(kobo: number) {
  return (kobo % 100 === 0 ? wholeNaira : nairaKobo).format(kobo / 100);
}

export function nairaToKobo(amount: number) {
  return Math.round(amount * 100);
}

export function koboToNaira(kobo: number) {
  return kobo / 100;
}

/** Percentage in basis points: applyBps(10000, 750) === 750 (7.5%). */
export function applyBps(amountKobo: number, bps: number) {
  return Math.round((amountKobo * bps) / 10000);
}

export function formatBps(bps: number) {
  return `${(bps / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}%`;
}
