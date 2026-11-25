import { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
  exiting?: boolean;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }): ReactNode {
  const [toasts, setToasts] = useState<Toast[]>([]);
  /** 自动移除与手动关闭各自去重，避免同一条 Toast 排两次定时器 */
  const autoTimersRef = useRef(new Map<number, number>());
  const exitingRef = useRef(new Set<number>());

  const remove = useCallback((id: number) => {
    if (exitingRef.current.has(id)) return;
    exitingRef.current.add(id);
    const autoTimer = autoTimersRef.current.get(id);
    if (autoTimer !== undefined) {
      clearTimeout(autoTimer);
      autoTimersRef.current.delete(id);
    }
    // Start exit animation
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    // Remove after animation completes
    window.setTimeout(() => {
      exitingRef.current.delete(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 250);
  }, []);

  const add = useCallback(
    (message: string, type: 'success' | 'error') => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, type }]);
      const timer = window.setTimeout(() => remove(id), 2500);
      autoTimersRef.current.set(id, timer);
    },
    [remove],
  );

  const value: ToastContextValue = {
    success: useCallback((msg: string) => add(msg, 'success'), [add]),
    error: useCallback((msg: string) => add(msg, 'error'), [add]),
  };

  return (
    <ToastContext value={value}>
      {children}
      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-[55] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm ${
              toast.exiting ? 'animate-toast-out' : 'animate-toast'
            } ${
              toast.type === 'success'
                ? 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
                : 'bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            )}
            <span>{toast.message}</span>
            <button
              onClick={() => remove(toast.id)}
              className="ml-2 p-0.5 text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
