export function envGet(name: string): string {
  const netlify = (globalThis as any)?.Netlify;
  if (netlify?.env?.get) {
    const value = netlify.env.get(name);
    if (value) return String(value);
  }

  if (typeof process !== "undefined" && process?.env) {
    const value = process.env[name];
    if (value) return String(value);
  }

  return "";
}

export function envHas(name: string): boolean {
  return Boolean(envGet(name));
}
