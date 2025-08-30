import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'update';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    handler: () => void;
  };
  dismissible?: boolean;
}

export interface ToastOptions {
  type?: ToastType;
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    handler: () => void;
  };
  dismissible?: boolean;
}

function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);

  const add = (options: ToastOptions) => {
    const id = Math.random().toString(36).substring(2, 15);
    const toast: Toast = {
      id,
      type: options.type || 'info',
      title: options.title,
      message: options.message,
      duration: options.duration || 5000,
      action: options.action,
      dismissible: options.dismissible !== false
    };

    update(toasts => [...toasts, toast]);

    // Auto-dismiss if duration is set and not persistent
    if (toast.duration > 0 && toast.type !== 'update') {
      setTimeout(() => {
        dismiss(id);
      }, toast.duration);
    }

    return id;
  };

  const dismiss = (id: string) => {
    update(toasts => toasts.filter(t => t.id !== id));
  };

  const clear = () => {
    update(() => []);
  };

  return {
    subscribe,
    add,
    dismiss,
    clear,
    // Convenience methods
    success: (title: string, message?: string, duration?: number) => 
      add({ type: 'success', title, message, duration }),
    error: (title: string, message?: string, duration?: number) => 
      add({ type: 'error', title, message, duration }),
    info: (title: string, message?: string, duration?: number) => 
      add({ type: 'info', title, message, duration }),
    warning: (title: string, message?: string, duration?: number) => 
      add({ type: 'warning', title, message, duration }),
    update: (title: string, message?: string, onReload?: () => void) => 
      add({ 
        type: 'update', 
        title, 
        message, 
        duration: 0, // Persistent until dismissed
        action: onReload ? { label: 'Reload', handler: onReload } : undefined,
        dismissible: true
      })
  };
}

export const toastStore = createToastStore();