import { DataTable } from "./DataTable.tsx";

interface Field {
  name: string;
  dataTypeID: number;
}

interface TableData {
  command?: string;
  rowCount: number;
  rows: any[];
  fields: Field[];
}

interface TableSectionProps {
  title: string;
  tables: Record<string, TableData | null>;
  isLoading?: boolean;
  children?: React.ReactNode;
}

export function TableSection({
  title,
  tables,
  isLoading = false,
  children,
}: TableSectionProps) {
  // Always render tables, even if empty
  const tableEntries = Object.entries(tables);

  return (
    <div className="tables-section">
      <h2 className="section-title">{title}</h2>
      {children}
      <div className="primitive-tables">
        {tableEntries.length === 0
          ? (
            <div className="table-error">
              No {title.toLowerCase()} configured
            </div>
          )
          : (
            tableEntries.map(([tableName, data]) => (
              <DataTable
                key={tableName}
                title={tableName}
                data={data}
              />
            ))
          )}
      </div>
    </div>
  );
}
