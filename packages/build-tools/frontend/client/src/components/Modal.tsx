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
      window.open(url, "_blank", "noopener,noreferrer");
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
              >
                🗗
              </button>
            )}
            <button className="modal-close" onClick={onClose}>
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
