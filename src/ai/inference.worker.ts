import { appConfig } from '../../app.config';
import { env, pipeline } from '@huggingface/transformers';
import { model } from './AIManager';
let generator: any;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      env.allowLocalModels = false;
      env.logLevel = 50;
      env.useBrowserCache = false;
      env.useCustomCache = true;
      const cache = await caches.open(data.cache);
      const modelPrefix = 'https://huggingface.co/' + model.id + '/resolve/';
      const key = (request: RequestInfo | URL) => {
        const value =
          typeof request === 'string'
            ? request
            : request instanceof URL
              ? request.href
              : request.url;
        return value.startsWith(modelPrefix + 'main/')
          ? value.replace(modelPrefix + 'main/', modelPrefix + model.revision + '/')
          : value;
      };
      // Transformers v4 preflight metadata may omit revision. Normalize both fetch
      // and cache keys so all model metadata and weights use the pinned revision.
      env.customCache = {
        match: (request) => cache.match(key(request)),
        put: (request, response) => cache.put(key(request), response),
      };
      env.fetch = async (request, options) => {
        const url = key(request);
        const cached = await cache.match(url);
        if (cached) return cached;
        if (!navigator.onLine) return new Response(null, { status: 404 });
        return fetch(url, options);
      };
      env.backends.onnx.wasm!.numThreads = 1;
      env.backends.onnx.wasm!.proxy = false;
      // Inference runtime is a bundled static asset; no CDN scripts or inference endpoints.
      const runtime = new URL(
        import.meta.env.BASE_URL + 'ai/' + appConfig.inferenceRuntime + '/',
        self.location.origin,
      ).href;
      env.useWasmCache = true;
      env.backends.onnx.wasm!.wasmPaths = {
        mjs: runtime + 'ort-wasm-simd-threaded.mjs',
        wasm: runtime + 'ort-wasm-simd-threaded.wasm',
      };
      generator = await pipeline('text-generation', model.id, {
        revision: model.revision,
        device: 'wasm',
        dtype: 'q4',
        progress_callback: (p: any) =>
          self.postMessage({
            type: 'progress',
            text: p.status === 'progress' ? `${p.file}: ${Math.round(p.progress)}%` : p.status,
          }),
      });
      env.allowRemoteModels = false;
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'generate' && generator) {
      const result = await generator(
        [
          {
            role: 'system',
            content:
              'You assist with Alpine Linux BusyBox ash. Give concise commands and explanations. Do not claim to have executed anything. Warn before destructive operations.',
          },
          { role: 'user', content: data.prompt },
        ],
        { max_new_tokens: 160, do_sample: false, return_full_text: false },
      );
      const output = result[0].generated_text;
      self.postMessage({
        type: 'result',
        text: typeof output === 'string' ? output : output.at(-1).content,
      });
    }
  } catch {
    self.postMessage({ type: 'failed' });
  }
};
