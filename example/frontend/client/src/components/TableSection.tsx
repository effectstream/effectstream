import { DataTable } from "./DataTable";

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
  const hasAnyData = Object.values(tables).some((data) =>
    data !== null && data !== undefined
  );

  return (
    <div className="tables-section">
      <h2 className="section-title">{title}</h2>
      {children}
      <div className="primitive-tables">
        {isLoading
          ? (
            <div className="table-loading">
              Loading {title.toLowerCase()}...
            </div>
          )
          : !hasAnyData
          ? (
            <div className="table-error">
              No {title.toLowerCase()} available
            </div>
          )
          : (
            Object.entries(tables).map(([tableName, data]) => (
              data && (
                <DataTable
                  key={tableName}
                  title={tableName}
                  data={data}
                />
              )
            ))
          )}
      </div>
    </div>
  );
}
