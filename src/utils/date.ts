export function toUTCKey(value: string | Date | null | undefined) {
  if (!value) return null;

  let d: Date;
  if (value instanceof Date) {
    d = value;
  } else {
    const raw = value ?? "";
    const hasTZ = /[+-]\d\d:?\d\d$|Z$/.test(raw);
    const isoish = raw.includes("T") ? raw : raw.replace(" ", "T");
    d = new Date(hasTZ ? isoish : `${isoish}Z`);
  }

  if (isNaN(d.getTime())) return null;
  const dayUTC = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return dayUTC.toISOString().slice(0, 10);
}

export function toIso(v: unknown): string {
  if (!v) return "";
  const d = v instanceof Date ? new Date(v.getTime()) : new Date(String(v));
  return isNaN(d.getTime()) ? "" : d.toISOString();
}
