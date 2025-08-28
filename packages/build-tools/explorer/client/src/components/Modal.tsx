import { useEffect } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  url?: string;
}

export function Modal(
  { isOpen, onClose, title, children, className, url }: ModalProps,
) {
  useEffect(() => {
    if (isOpen) {
      // Save the current overflow value
      const originalOverflow = document.body.style.overflow;
      // Lock body scroll
      document.body.style.overflow = "hidden";

      // Cleanup function to restore original overflow when modal closes
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  const handleOpenInNewWindow = () => {
    if (url) {
      globalThis?.open?.(url, "_blank", "noopener,noreferrer");
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-content ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <div className="modal-header-actions">
            {url && (
              <button
                className="modal-open-new-window"
                onClick={handleOpenInNewWindow}
                aria-label="Open in new window"
                title="Open in new window"
                type="button"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </button>
            )}
            <button className="modal-close" onClick={onClose} type="button">
              ×
            </button>
          </div>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}
