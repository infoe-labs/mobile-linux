// Capture early, before React mounts. Never trigger an install prompt without a user gesture.
let promptEvent = null;
let installedInSession = false;
const listeners = new Set();
const media = window.matchMedia('(display-mode: standalone)');
export function installationState() {
  return {
    canPrompt: !!promptEvent,
    installed: installedInSession || media.matches || window.navigator.standalone === true,
  };
}
const notify = () => listeners.forEach((listener) => listener(installationState()));
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  promptEvent = event;
  notify();
});
window.addEventListener('appinstalled', () => {
  installedInSession = true;
  promptEvent = null;
  notify();
});
media.addEventListener('change', notify);
export function subscribeInstall(listener) {
  listeners.add(listener);
  listener(installationState());
  return () => {
    listeners.delete(listener);
  };
}
export async function promptInstall() {
  const event = promptEvent;
  if (!event) return null;
  promptEvent = null;
  notify();
  await event.prompt();
  return event.userChoice;
}
