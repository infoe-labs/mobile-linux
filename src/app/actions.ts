export type Act = (work: () => Promise<unknown>) => Promise<void>;
