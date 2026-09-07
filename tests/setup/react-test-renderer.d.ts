// react-test-renderer 19 ships no types; the smoke tests need only this slice.
declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';
  export interface ReactTestInstance {
    type: string | Function;
    props: Record<string, any>;
    children: Array<ReactTestInstance | string>;
    findAll(predicate: (node: ReactTestInstance) => boolean): ReactTestInstance[];
  }
  export interface ReactTestRenderer {
    root: ReactTestInstance;
    update(element: ReactElement): void;
    unmount(): void;
  }
  export function create(element: ReactElement): ReactTestRenderer;
  export function act(callback: () => Promise<void> | void): Promise<void>;
  const TestRenderer: { create: typeof create; act: typeof act };
  export default TestRenderer;
}
