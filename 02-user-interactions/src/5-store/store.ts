export type Store = {
  step: number;
  addStep: () => void;
};

export const store = {
  step: 0,
  addStep() {
    store.step += 1;
  }
} satisfies Store;
