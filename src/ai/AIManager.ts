import { storageScope } from '../lib/storage';
import { appConfig } from '../../app.config';
export const model = {
  id: 'HuggingFaceTB/SmolLM2-135M-Instruct',
  revision: '12fd25f77366fa6b3b4b768ec3050bf629380bac',
  license: 'Apache-2.0',
  download: 'approximately 185 MB',
  storage: 'allow 400 MB; runtime memory can exceed 700 MB',
};
export const modelCache = storageScope({
  appId: appConfig.appId,
  basePath: import.meta.env.BASE_URL,
  namespace: 'model',
  version: 1,
});
export type AIState = 'unloaded' | 'loading' | 'ready' | 'generating' | 'failed';
class AIManager extends EventTarget {
  state: AIState = 'unloaded';
  progress = '';
  result = '';
  private worker?: Worker;
  private change() {
    this.dispatchEvent(new Event('change'));
  }
  load() {
    if (this.worker) return;
    this.state = 'loading';
    this.change();
    this.worker = new Worker(new URL('./inference.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => {
      if (data.type === 'progress') this.progress = data.text;
      if (data.type === 'ready') this.state = 'ready';
      if (data.type === 'result') {
        this.result = data.text;
        this.state = 'ready';
      }
      if (data.type === 'failed') {
        this.state = 'failed';
        this.progress =
          'Local model could not load or generate. Unload and retry with more free memory.';
      }
      this.change();
    };
    this.worker.onerror = () => {
      this.state = 'failed';
      this.progress = 'Local inference worker failed. Unload to reclaim memory.';
      this.change();
    };
    this.worker.postMessage({ type: 'load', cache: modelCache });
  }
  generate(prompt: string) {
    if (this.state !== 'ready' || !prompt.trim()) return;
    this.result = '';
    this.state = 'generating';
    this.change();
    this.worker!.postMessage({ type: 'generate', prompt: prompt.slice(0, 6000) });
  }
  unload() {
    this.worker?.terminate();
    this.worker = undefined;
    this.state = 'unloaded';
    this.progress = '';
    this.result = '';
    this.change();
  }
  async remove() {
    this.unload();
    await caches.delete(modelCache);
  }
}
export const ai = new AIManager();
