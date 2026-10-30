export const appConfig = {
  appId: 'alpine-pocket',
  inferenceRuntime: 'ort-1.31.0-dev.20260914-8d85527a0',
  name: 'Alpine Pocket',
  shortName: 'Alpine Pocket',
  description: 'A real Alpine Linux computer, local to your browser.',
  themeColor: '#10161b',
  backgroundColor: '#10161b',
};
export function normalizeBase(value = '/') {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(value)) throw new Error('Invalid deployment base.');
  return value;
}
