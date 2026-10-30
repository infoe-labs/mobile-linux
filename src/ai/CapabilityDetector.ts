export async function capabilities() {
  const gpu = (navigator as any).gpu;
  let webgpu = false;
  try {
    webgpu = !!(gpu && (await gpu.requestAdapter()));
  } catch {
    /* Optional acceleration unavailable. */
  }
  return {
    webgpu,
    wasm: typeof WebAssembly === 'object',
    locks: !!navigator.locks,
    opfs: !!navigator.storage?.getDirectory,
    deviceMemory: (navigator as any).deviceMemory ?? null,
    storage: (await navigator.storage?.estimate?.()) ?? null,
  };
}
