import React from 'react';

interface ResultTableProps {
  data: Record<string, unknown>;
}

export const ResultTable: React.FC<ResultTableProps> = ({ data }) => (
  <table className="kv-table">
    <tbody>
      {Object.entries(data).map(([key, value]) => (
        <tr key={key}>
          <td className="kv-label">{key}</td>
          <td className="kv-value">
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);
