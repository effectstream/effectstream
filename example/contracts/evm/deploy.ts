import type { Chain } from "npm:viem";

export type ContractDeployment = {
  path: string;
  name: string;
  args?: string[];
  chain: Chain;
};
const __dirname = import.meta.dirname;
export const deploy = async function (
  myContracts: ContractDeployment[],
  privateKey: string,
) {
  const deployedAddresses: Record<string, string> = {};

  for (const contract of myContracts) {
    const args = [
      "create",
      `${contract.path}:${contract.name}`,
      "--broadcast",
      "--rpc-url",
      contract.chain.rpcUrls.default.http[0],
      "--private-key",
      privateKey,
      contract.args ? "--constructor-args" : undefined,
      ...(contract.args ?? []),
    ].filter(Boolean) as string[];

    console.log(`🚀  Deploying ${contract.name}`);
    const command = new Deno.Command("forge", {
      args,
    });
    const { stdout, stderr } = await command.output();
    const stdoutText = new TextDecoder().decode(stdout);
    const stderrText = new TextDecoder().decode(stderr);

    console.log(stdoutText);
    console.log(stderrText);

    // Parse the deployed address from stdout
    const deployedToMatch = stdoutText.match(/Deployed to: (0x[a-fA-F0-9]+)/);
    if (deployedToMatch) {
      deployedAddresses[contract.name + "-" + contract.chain.id] =
        deployedToMatch[1];
    }
  }

  // Generate the contract.addresses.ts file
  await generateAddressesFile(deployedAddresses);
};

async function generateAddressesFile(addresses: Record<string, string>) {
  const addressesContent = `export const contractAddresses = {
${
    Object.entries(addresses).map(([name, address]) =>
      `  "${name}": "${address}",`
    ).join("\n")
  }
} as const;
`;

  await Deno.writeTextFile(
    __dirname + "/contract.addresses.ts",
    addressesContent,
  );
  console.log("✅ Generated contract.addresses.ts");
}
