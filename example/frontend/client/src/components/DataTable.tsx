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

interface DataTableProps {
  title: string;
  data: TableData | null;
}

function formatCellValue(value: any, fieldName: string): string {
  if (value === null || value === undefined) return "";

  // Special handling for inputs field (JSON strings)
  if (fieldName === "inputs" && typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      const formatted = JSON.stringify(parsed, null, 1).replace(/\n/g, "<br>");
      return `<code style="font-size: 0.75em; background: rgba(0,0,0,0.1); padding: 4px 6px; border-radius: 3px; display: block; white-space: pre-wrap; max-height: 80px; overflow-y: auto;">${formatted}</code>`;
    } catch (e) {
      return value.toString();
    }
  }

  // Check if this looks like an Ethereum address
  if (
    typeof value === "string" && value.startsWith("0x") && value.length === 42
  ) {
    return `<span class="address-cell" style="overflow: hidden; text-overflow: ellipsis;" title="${value}">${value}</span>`;
  }

  // Format large numbers
  if (typeof value === "string" && /^\d+$/.test(value) && value.length > 10) {
    const num = BigInt(value);
    if (fieldName && fieldName.toLowerCase().includes("balance")) {
      const eth = Number(num) / Math.pow(10, 18);
      return `${eth.toFixed(6)} ETH`;
    }
    return num.toString();
  }

  return value.toString();
}

export function DataTable({ title, data }: DataTableProps) {
  // Always show the table container with title
  const hasData = data && data.rows && data.fields && data.rows.length > 0;
  const fields = data?.fields || [];
  const rows = data?.rows || [];

  return (
    <div
      className={`primitive-table-container ${
        rows.length > 6 ? "has-scroll" : ""
      }`}
    >
      <h3 className="primitive-table-title">{title}</h3>
      {!hasData
        ? <div className="table-error">No data available</div>
        : (
          <table className="primitive-table">
            <thead>
              <tr>
                {fields.map((field) => (
                  <th key={field.name}>
                    {field.name.replace(/_/g, " ").toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice().reverse().map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {fields.map((field) => {
                    const value = row[field.name];
                    const formattedValue = formatCellValue(value, field.name);
                    const plainTextValue = value ? value.toString() : "";

                    return (
                      <td
                        key={field.name}
                        dangerouslySetInnerHTML={{ __html: formattedValue }}
                        title={plainTextValue.length > 30
                          ? plainTextValue
                          : undefined}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  );
}
