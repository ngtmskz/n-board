import { useEffect, useState } from 'react';

const EVENT = 'nboard:toast';

export function toast(message: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));
}

export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    const onToast = (e: Event) => {
      setMessage((e as CustomEvent<string>).detail);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMessage(null), 2500);
    };
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      window.clearTimeout(timer);
    };
  }, []);
  if (!message) return null;
  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}
