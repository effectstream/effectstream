import { useState } from "react";
import { RowDetailsModal } from "./RowDetailsModal.tsx";

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

interface PaginationMeta {
  limit: number;
  cursors: (string | undefined)[];
  currentPage: number;
  hasMore: boolean;
}

interface DataTableProps {
  title: string;
  data: TableData | null;
  pagination?: PaginationMeta;
  onPrev?: () => void;
  onNext?: () => void;
  onFirst?: () => void;
  onLimitChange?: (limit: number) => void;
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

export function DataTable(
  { title, data, pagination, onPrev, onNext, onFirst, onLimitChange }:
    DataTableProps,
) {
  const [selectedRow, setSelectedRow] = useState<Record<string, any> | null>(
    null,
  );

  // Always show the table container with title
  const hasData = data && data.rows && data.fields && data.rows.length > 0;
  const fields = data?.fields || [];
  const rows = data?.rows || [];
  const canGoNext = !!pagination && pagination.hasMore &&
    rows.length >= pagination.limit;
  const canGoPrev = !!pagination && pagination.currentPage > 0;

  const hideControls = !pagination || (!canGoPrev && !canGoNext);

  return (
    <>
      <div
        className={`primitive-table-container ${
          rows.length > 6 ? "has-scroll" : ""
        }`}
      >
        <h3 className="primitive-table-title">{title}</h3>
        {!hasData
          ? <div className="table-error">
            {/* No data available */}
            </div>
          : (
            <div className="primitive-table-wrapper">
              <table className="primitive-table">
                <thead>
                  <tr>
                    <th className="actions-column" />
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
                      <td className="actions-cell">
                        <button
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                          }}
                          type="button"
                          onClick={() => setSelectedRow(row)}
                          className="details-button"
                        >
                          🔍
                        </button>
                      </td>
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
            </div>
          )}
        {/* Pagination Controls */}
        {pagination && !hideControls && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={onFirst}
                disabled={!canGoPrev}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #ddd",
                  background: canGoPrev ? "white" : "#f3f4f6",
                  cursor: canGoPrev ? "pointer" : "not-allowed",
                }}
              >
                First
              </button>
              <button
                type="button"
                onClick={onPrev}
                disabled={!canGoPrev}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #ddd",
                  background: canGoPrev ? "white" : "#f3f4f6",
                  cursor: canGoPrev ? "pointer" : "not-allowed",
                }}
              >
                Prev
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={!canGoNext}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #ddd",
                  background: canGoNext ? "white" : "#f3f4f6",
                  cursor: canGoNext ? "pointer" : "not-allowed",
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
      <RowDetailsModal
        isOpen={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        rowData={selectedRow}
        fields={fields}
        title={`${title} Row Details`}
      />
    </>
  );
}
