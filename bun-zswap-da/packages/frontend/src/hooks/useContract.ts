// src/hooks/useContract.ts
export function useContract() {
  const connectContract = async () => {
    console.log("NYI: Connect to contract");
  };

  const submitMint = async (payload: any) => {
    console.log("NYI: Submit mint to contract", payload);
  };

  return { connectContract, submitMint };
}
