// The school runs on Myanmar time (UTC+6:30, no daylight saving), whatever the device's clock
// is set to. Same calendar day the server bills by (server/utils/billing.js).
const MYANMAR_OFFSET_MS = 6.5 * 60 * 60 * 1000;

export const today = () => new Date(Date.now() + MYANMAR_OFFSET_MS).toISOString().split("T")[0];
export const thisMonth = () => today().slice(0, 7);
