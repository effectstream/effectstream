import { Modal } from "./Modal.tsx";

interface TableSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  tableNames: string[];
  onSelect: (tableName: string) => void;
}

export function TableSelectorModal({
  isOpen,
  onClose,
  title,
  tableNames,
  onSelect,
}: TableSelectorModalProps) {
  const handleSelect = (tableName: string) => {
    onSelect(tableName);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="table-selector-content">
        <ul>
          {tableNames.map((tableName) => (
            <li key={tableName}>
              <button type="button" onClick={() => handleSelect(tableName)}>
                {tableName}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
