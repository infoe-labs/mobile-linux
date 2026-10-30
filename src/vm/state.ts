export type VMState =
  | 'uninitialized'
  | 'downloading'
  | 'preparing'
  | 'booting'
  | 'running'
  | 'saving'
  | 'paused'
  | 'restoring'
  | 'stopped'
  | 'failed';
const edges: Record<VMState, VMState[]> = {
  uninitialized: ['downloading', 'failed'],
  downloading: ['preparing', 'failed'],
  preparing: ['booting', 'failed'],
  booting: ['running', 'failed', 'stopped'],
  running: ['paused', 'saving', 'stopped', 'failed'],
  saving: ['running', 'paused', 'failed'],
  paused: ['running', 'saving', 'restoring', 'stopped', 'failed'],
  restoring: ['running', 'paused', 'failed'],
  stopped: ['failed'],
  failed: [],
};
export function canTransition(from: VMState, to: VMState) {
  return edges[from].includes(to);
}
