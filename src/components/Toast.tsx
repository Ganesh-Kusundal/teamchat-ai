/**
 * Toast notification system — error, warning, and success variants.
 * Auto-dismisses after 4 seconds with an animated progress bar.
 * Stacks up to 5 toasts, oldest first.
 */
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, AlertTriangle, XCircle, X } from 'lucide-react';

export type ToastVariant = 'success' | 'warning' | 'error';

interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
}

interface ToastContextType {
  success: (message: string) => void;
  warning: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const AUTO_DISMISS_MS = 4000;
const MAX_TOASTS = 5;

const VARIANT_STYLES: Record<ToastVariant, { container: string; icon: string; bar: string }> = {
  success: {
    container:
      'bg-[#0f2318]/95 border-emerald-700/50 text-emerald-200',
    icon: 'text-emerald-400',
    bar: 'bg-emerald-500',
  },
  warning: {
    container:
      'bg-[#1e1a0e]/95 border-amber-700/50 text-amber-200',
    icon: 'text-amber-400',
    bar: 'bg-amber-500',
  },
  error: {
    container:
      'bg-[#200f0f]/95 border-red-700/50 text-red-200',
    icon: 'text-red-400',
    bar: 'bg-red-500',
  },
};

const VARIANT_ICONS: Record<ToastVariant, React.FC<{ className?: string }>> = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
};

// Single toast card
const ToastCard: React.FC<{ toast: ToastItem; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  const { container, icon: iconClass, bar } = VARIANT_STYLES[toast.variant];
  const Icon = VARIANT_ICONS[toast.variant];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.92 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      role="alert"
      aria-live="assertive"
      className={`relative flex items-start gap-3 w-80 max-w-xs rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-sm overflow-hidden ${container}`}
    >
      {/* Progress bar */}
      <motion.div
        className={`absolute bottom-0 left-0 h-[2px] ${bar}`}
        initial={{ width: '100%' }}
        animate={{ width: '0%' }}
        transition={{ duration: AUTO_DISMISS_MS / 1000, ease: 'linear' }}
      />

      {/* Icon */}
      <Icon className={`w-4.5 h-4.5 mt-0.5 shrink-0 ${iconClass}`} />

      {/* Message */}
      <p className="flex-1 text-sm leading-snug font-medium">{toast.message}</p>

      {/* Dismiss button */}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
};

// Provider
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    clearTimeout(timersRef.current[id]);
    delete timersRef.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => {
        const next = [...prev, { id, variant, message }];
        return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
      });
      timersRef.current[id] = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const api: ToastContextType = {
    success: (msg) => push('success', msg),
    warning: (msg) => push('warning', msg),
    error: (msg) => push('error', msg),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Toast stack — bottom-right */}
      <div
        className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 items-end pointer-events-none"
        aria-label="Notifications"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <div key={t.id} className="pointer-events-auto">
              <ToastCard toast={t} onDismiss={dismiss} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

// Hook
export const useToast = (): ToastContextType => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
};
