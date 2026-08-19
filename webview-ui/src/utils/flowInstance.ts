import type { FitViewOptions, Viewport } from '@xyflow/react';

interface FlowInstance {
  fitView: (options?: FitViewOptions) => Promise<boolean>;
  getViewport: () => Viewport;
  setViewport: (viewport: Viewport, options?: { duration?: number }) => Promise<boolean>;
}

let instance: FlowInstance | null = null;

export function registerFlowInstance(i: FlowInstance) {
  instance = i;
}

export function getFlowInstance(): FlowInstance | null {
  return instance;
}
