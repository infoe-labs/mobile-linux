const events = new EventTarget();
let registration;
const changed = () => events.dispatchEvent(new Event('change'));

export const pwa = {
  ready: false,
  update: false,
  error: false,
  supported: 'serviceWorker' in navigator,
  events,
  async applyUpdate() {
    const waiting = registration?.waiting;
    if (!waiting) throw new Error('No waiting update.');
    // Attach before messaging; only this tab's explicit acceptance triggers reload.
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
      once: true,
    });
    waiting.postMessage({ type: 'SKIP_WAITING' });
  },
};

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    pwa.ready = true;
    pwa.update = !!registration?.waiting;
    changed();
  });
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
      updateViaCache: 'none',
    })
    .then((result) => {
      registration = result;
      pwa.ready = !!result.active;
      pwa.update = !!result.waiting;
      changed();
      function track(worker) {
        if (!worker) return;
        const onStateChange = () => {
          if (worker.state === 'installed') {
            if (navigator.serviceWorker.controller) pwa.update = true;
            else pwa.ready = true;
            worker.removeEventListener('statechange', onStateChange);
            changed();
          }
          if (worker.state === 'redundant') {
            pwa.error = true;
            changed();
          }
        };
        worker.addEventListener('statechange', onStateChange);
      }
      track(result.installing);
      result.addEventListener('updatefound', () => track(result.installing));
    })
    .catch(() => {
      pwa.error = true;
      changed();
    });
}
