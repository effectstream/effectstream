import React from 'react';
import { createPortal } from 'react-dom';

interface Field {
  name: string;
  dataTypeID: number;
}

interface RowDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  rowData: Record<string, any> | null;
  fields: Field[];
  title?: string;
}

function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

export function RowDetailsModal({
  isOpen,
  onClose,
  rowData,
  fields,
  title = 'Row Details',
}: RowDetailsModalProps) {
  if (!isOpen || !rowData) {
    return null;
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="details-modal-content" style={{ maxWidth: '80%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <table className="details-table">
            <tbody>
              {fields.map((field) => (
                <tr key={field.name}>
                  <td className="details-key">
                    {field.name.replace(/_/g, ' ').toUpperCase()}
                  </td>
                  <td className="details-value">
                    <pre>{formatValue(rowData[field.name])}</pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body,
  );
}
