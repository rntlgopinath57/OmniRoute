let runtimeEnv: Record<string, unknown> = {};

export function setRuntimeEnv(values: Record<string, unknown> | undefined | null) {
  runtimeEnv = values || {};
}

export function envGet(name: string): string {
  const runtimeValue = runtimeEnv?.[name];
  if (runtimeValue !== undefined && runtimeValue !== null && runtimeValue !== "") {
    return String(runtimeValue);
  }

  const netlify = (globalThis as any)?.Netlify;
  if (netlify?.env?.get) {
    const value = netlify.env.get(name);
    if (value) return String(value);
  }

  const processEnv = (globalThis as any)?.process?.env;
  if (processEnv) {
    const value = processEnv[name];
    if (value) return String(value);
  }

  return "";
}

export function envHas(name: string): boolean {
  return Boolean(envGet(name));
}
