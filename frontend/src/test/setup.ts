import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// Full-app renders are slow on some machines and much slower under coverage instrumentation;
// the 1 s default makes `findBy…` flaky there without catching any real bug.
configure({ asyncUtilTimeout: 5_000 });

// jsdom does not implement <dialog> modal behaviour; emulate just enough for component tests.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
