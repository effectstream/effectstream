import { useEffect, useMemo, useState } from "react";
import { Modal } from "./Modal.tsx";

interface TablesMultiSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  tableNames: string[];
  selectedNames: string[];
  onApply: (selected: string[]) => void;
}

export function TablesMultiSelectModal(
  { isOpen, onClose, title, tableNames, selectedNames, onApply }:
    TablesMultiSelectModalProps,
) {
  const initialSelection = useMemo(() => new Set(selectedNames), [
    selectedNames,
  ]);
  const [draftSelection, setDraftSelection] = useState<Set<string>>(
    initialSelection,
  );

  useEffect(() => {
    setDraftSelection(new Set(selectedNames));
  }, [selectedNames, isOpen]);

  const toggle = (name: string) => {
    setDraftSelection((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAll = () => setDraftSelection(new Set(tableNames));
  const deselectAll = () => setDraftSelection(new Set());

  const handleApply = () => {
    onApply(Array.from(draftSelection));
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="table-selector-content">
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className="batcher-api-button"
            onClick={selectAll}
          >
            Select All
          </button>
          <button
            type="button"
            className="batcher-api-button"
            onClick={deselectAll}
          >
            Deselect All
          </button>
        </div>
        <ul>
          {tableNames.map((name) => (
            <li key={name}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={draftSelection.has(name)}
                  onChange={() => toggle(name)}
                />
                {name}
              </label>
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            type="button"
            className="batcher-api-button"
            onClick={handleApply}
          >
            Apply
          </button>
          <button
            type="button"
            className="documentation-button"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
