import { useEffect, useState } from "react";
import { ADDRESSES_ENDPOINT } from "../config.ts";

interface AddressRow {
  account_id: number | null;
  address: string;
  primary_address: string | null;
}

interface GroupedAddress {
  account_id: number | null;
  addresses: string[];
  hasPrimaryAddress: boolean;
  primaryAddress: string | null;
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

  // Group addresses by account_id
  const groupedAddresses = addresses.reduce((groups: GroupedAddress[], row) => {
    const existingGroup = groups.find((group) =>
      group.account_id === row.account_id
    );

    if (existingGroup) {
      // Add address to existing group if not already present
      if (!existingGroup.addresses.includes(row.address)) {
        existingGroup.addresses.push(row.address);
      }
      // Update primary address info if this row has a primary address
      if (row.primary_address) {
        existingGroup.hasPrimaryAddress = true;
        existingGroup.primaryAddress = row.primary_address;
      }
    } else {
      // Create new group
      groups.push({
        account_id: row.account_id,
        addresses: [row.address],
        hasPrimaryAddress: !!row.primary_address,
        primaryAddress: row.primary_address,
      });
    }

    return groups;
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
              <th>Account ID</th>
              <th>Addresses</th>
            </tr>
          </thead>
          <tbody>
            {groupedAddresses.map((group, index) => (
              <tr
                key={group.account_id ?? `null-${index}`}
                className={group.hasPrimaryAddress ? "has-primary-address" : ""}
              >
                <td className="account-id-cell">
                  <div className="account-id-content">
                    {group.account_id ?? "No Account ID"}
                  </div>
                </td>
                <td className="addresses-cell">
                  {group.addresses.map((address, addrIndex) => (
                    <div
                      key={address}
                      className={`address-item ${
                        address === group.primaryAddress
                          ? "primary-address"
                          : ""
                      }`}
                      title={address === group.primaryAddress
                        ? `${address} (Primary)`
                        : address}
                    >
                      {address}
                      {address === group.primaryAddress && (
                        <span className="primary-badge">Primary</span>
                      )}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {groupedAddresses.length === 0 && (
        <div className="no-addresses">
          <div className="no-data-text">No addresses found</div>
        </div>
      )}
    </div>
  );
}
