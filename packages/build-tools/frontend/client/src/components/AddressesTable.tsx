import { useEffect, useState } from "react";
import { ADDRESSES_ENDPOINT } from "../config.ts";

interface AddressRow {
  id: number;
  address: string;
  main_id: number | null;
  main_address: string | null;
}

export function AddressesTable() {
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAddresses = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(ADDRESSES_ENDPOINT);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        setAddresses(data);
      } catch (err) {
        console.error("Error fetching addresses:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchAddresses();
  }, []);

  if (loading) {
    return (
      <div className="addresses-loading">
        <div className="loading-text">Loading addresses...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="addresses-error">
        <div className="error-text">Error loading addresses: {error}</div>
      </div>
    );
  }

  return (
    <div className="addresses-table-container">
      <div className="addresses-table-wrapper">
        <table className="addresses-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Address</th>
              <th>Main ID</th>
              <th>Main Address</th>
            </tr>
          </thead>
          <tbody>
            {addresses.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td className="address-cell" title={row.address}>
                  {row.address}
                </td>
                <td>{row.main_id || ""}</td>
                <td className="address-cell" title={row.main_address || ""}>
                  {row.main_address || ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {addresses.length === 0 && (
        <div className="no-addresses">
          <div className="no-data-text">No addresses found</div>
        </div>
      )}
    </div>
  );
}
