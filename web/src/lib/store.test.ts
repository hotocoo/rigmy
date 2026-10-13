import { beforeEach, describe, expect, it } from 'vitest';

import { DEF, useRig } from './store';

beforeEach(() => {
  // Merge, not replace: replacing would drop the action functions.
  useRig.setState({ ...DEF, co: { ...DEF.co }, cables: { ...DEF.cables }, notify: { ...DEF.notify } });
});

describe('store: build slots', () => {
  it('starts empty', () => {
    expect(useRig.getState().build).toEqual({});
  });

  it('setPart adds and replaces a slot', () => {
    const { setPart } = useRig.getState();
    setPart('cpu', 'cpu-a');
    expect(useRig.getState().build.cpu).toBe('cpu-a');
    setPart('cpu', 'cpu-b');
    expect(useRig.getState().build.cpu).toBe('cpu-b');
  });

  it('removePart clears a slot', () => {
    useRig.getState().setPart('cpu', 'cpu-a');
    useRig.getState().removePart('cpu');
    expect(useRig.getState().build.cpu).toBeUndefined();
  });

  it('set merges partial state', () => {
    useRig.getState().set({ region: 'pen' });
    const s = useRig.getState();
    expect(s.region).toBe('pen');
    expect(s.build).toEqual({});
  });
});

describe('store: compare list', () => {
  it('evicts the oldest at COMPARE_LIMIT and toggles off', () => {
    const st = () => useRig.getState();
    st().toggleCompare('p1', () => 'cpu');
    st().toggleCompare('p2', () => 'cpu');
    st().toggleCompare('p3', () => 'cpu');
    st().toggleCompare('p4', () => 'cpu');
    // Sliding window: the oldest entry is evicted, not the new one rejected.
    expect(st().compare).toEqual(['p2', 'p3', 'p4']);
    st().toggleCompare('p2', () => 'cpu');
    expect(st().compare).toEqual(['p3', 'p4']);
  });
});

describe('store: price watch', () => {
  it('adds and removes watch entries', () => {
    const st = () => useRig.getState();
    st().addWatch('p1', 1000);
    expect(st().watch).toEqual([{ id: 'p1', target: 1000, at: st().watch[0].at }]);
    st().removeWatch('p1');
    expect(st().watch).toEqual([]);
  });
});
