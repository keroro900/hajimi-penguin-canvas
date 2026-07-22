import { create } from 'zustand';

/**
 * Smart node composer coordinator.
 *
 * Owns exclusivity for the primary smart-node property popover: exactly one
 * node's composer is active at a time. Opening node B atomically replaces
 * node A. Session-only (no persistence) — a stored composer-open flag from
 * older builds must never reopen a popover on load.
 *
 * The store is importable outside React for tests and plain actions; nodes
 * normally use `useIsSmartNodeComposerOpen` plus the plain actions below.
 */

interface SmartNodeComposerState {
  activeNodeId: string | null;
  /** Activate this node's composer, atomically replacing any active one. */
  open: (nodeId: string) => void;
  /** Omitted id closes any composer; a supplied id closes only if active. */
  close: (nodeId?: string) => void;
}

export const useSmartNodeComposerStore = create<SmartNodeComposerState>((set) => ({
  activeNodeId: null,
  open: (nodeId) => {
    if (!nodeId) return;
    set({ activeNodeId: nodeId });
  },
  close: (nodeId) =>
    set((state) => {
      if (nodeId === undefined) {
        return state.activeNodeId === null ? state : { activeNodeId: null };
      }
      return state.activeNodeId === nodeId ? { activeNodeId: null } : state;
    }),
}));

/** Selector hook: is this node's composer the active one? */
export function useIsSmartNodeComposerOpen(nodeId: string): boolean {
  return useSmartNodeComposerStore((state) => state.activeNodeId === nodeId);
}

/** Plain getters/actions usable outside React components. */
export const smartNodeComposerActions = {
  open(nodeId: string) {
    useSmartNodeComposerStore.getState().open(nodeId);
  },
  close(nodeId?: string) {
    useSmartNodeComposerStore.getState().close(nodeId);
  },
  isOpen(nodeId: string) {
    return useSmartNodeComposerStore.getState().activeNodeId === nodeId;
  },
  activeNodeId() {
    return useSmartNodeComposerStore.getState().activeNodeId;
  },
};
