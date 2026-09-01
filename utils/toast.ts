type ToastListener = (title: string, message: string) => void;

let activeToastListener: ToastListener | null = null;

export function registerToastListener(listener: ToastListener) {
  activeToastListener = listener;
  return () => {
    if (activeToastListener === listener) {
      activeToastListener = null;
    }
  };
}

export function showFloatingToast(title: string, message: string) {
  if (activeToastListener) {
    activeToastListener(title, message);
  }
}
