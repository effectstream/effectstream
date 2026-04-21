// import { task, types } from 'hardhat/config';
// import '@nomicfoundation/hardhat-toolbox-viem';
// import { getContract, getOrAskString, ownerCheck, paimaScope } from './common.js';
// import { decodeAbiParameters } from 'viem';
// import { stringToBytes } from 'viem';

// paimaScope
//   .task('EffectstreamL2Contract:setFee', `Sets the fee of a Paima L2 contract`)
//   .addOptionalParam('contract', `The contracts's address`, undefined, types.string)
//   .addOptionalParam('fee', `The new fee (wei)`, undefined, types.string)
//   .setAction(async (taskArgs, hre) => {
//     const publicClient = await hre.viem.getPublicClient();
//     // Connect to the deployed contract
//     const { signer, account } = await getContract(hre, taskArgs.contract);
//     const contract = await hre.viem.getContractAt('EffectstreamL2Contract', account);

//     ownerCheck((await contract.read.owner()) as string, await signer.account!.address);

//     const newFee = BigInt(await getOrAskString(taskArgs.fee, 'Fee? '));
//     if ((await contract.read.fee()) === newFee) {
//       console.log(`Fee matches existing value "${newFee}". Skipping`);
//       return;
//     }
//     const hash = await contract.write.setFee([newFee]);
//     await publicClient.waitForTransactionReceipt({ hash });
//     const updatedValue = await contract.read.fee();
//     console.log(`The updated value of "fee" is: ${updatedValue}`);
//   });
// paimaScope
//   .task('EffectstreamL2Contract:setOwner', `Sets the owner of a Paima L2 contract`)
//   .addOptionalParam('contract', `The contracts's address`, undefined, types.string)
//   .addOptionalParam('owner', `The new owner address`, undefined, types.string)
//   .setAction(async (taskArgs, hre) => {
//     const publicClient = await hre.viem.getPublicClient();
//     // Connect to the deployed contract
//     const { signer, account } = await getContract(hre, taskArgs.contract);
//     const contract = await hre.viem.getContractAt('EffectstreamL2Contract', account);

//     ownerCheck((await contract.read.owner()) as string, await signer.account!.address);

//     if ((await contract.read.owner()) === taskArgs.owner) {
//       console.log(`Owner matches existing value "${taskArgs.owner}". Skipping`);
//       return;
//     }
//     const hash = await contract.write.setOwner([taskArgs.owner]);
//     await publicClient.waitForTransactionReceipt({ hash });
//     const updatedValue = await contract.read.owner();
//     console.log(`The updated value of "owner" is: ${updatedValue}`);
//   });

// paimaScope
//   .task('EffectstreamL2Contract:withdrawFunds', `Withdraws funds out of the Paima L2 contract`)
//   .addOptionalParam('contract', `The contracts's address`, undefined, types.string)
//   .setAction(async (taskArgs, hre) => {
//     const publicClient = await hre.viem.getPublicClient();
//     // Connect to the deployed contract
//     const { signer, account } = await getContract(hre, taskArgs.contract);
//     const contract = await hre.viem.getContractAt('EffectstreamL2Contract', account);

//     ownerCheck((await contract.read.owner()) as string, await signer.account!.address);

//     const currentBalance = await publicClient.getBalance({
//       address: account,
//     });
//     if (currentBalance === 0n) {
//       console.log(`Current balance is "${0n}". Skipping`);
//       return;
//     }
//     const hash = await contract.write.withdrawFunds();
//     await publicClient.waitForTransactionReceipt({ hash });
//     console.log(`Withdrew ${currentBalance} to ${await signer.account!.address}`);
//   });

// paimaScope
//   .task('EffectstreamL2Contract:submitGameInput', `Submit data to the Paima L2 contract`)
//   .addOptionalParam('contract', `The contracts's address`, undefined, types.string)
//   .addOptionalParam(
//     'data',
//     `The data to submit either hex-encoded (0x...) or Paima concise-encoded`,
//     undefined,
//     types.string
//   )
//   .setAction(async (taskArgs, hre) => {
//     const publicClient = await hre.viem.getPublicClient();
//     // Connect to the deployed contract
//     const { signer, account } = await getContract(hre, taskArgs.contract);
//     const contract = await hre.viem.getContractAt('EffectstreamL2Contract', account);

//     const providedData = await getOrAskString(taskArgs.data, 'data? ');
//     const data = providedData.startsWith('0x') ? providedData : stringToBytes(providedData);

//     const fee = await contract.read.fee();
//     console.log(fee);
//     const hash = await contract.write.effectstreamSubmitGameInput([data], { value: fee });
//     await publicClient.waitForTransactionReceipt({ hash });
//     console.log(`Submitted data to the contract successfully at ${hash}`);
//   });

// paimaScope
//   .task('EffectstreamL2Contract:recentInputs', `Gets data recently submitted to the Paima L2 contract`)
//   .addOptionalParam('contract', `The contracts's address`, undefined, types.string)
//   .addOptionalParam(
//     'data',
//     `The data to submit in hex-encoded for (0x...)`,
//     undefined,
//     types.string
//   )
//   .addOptionalParam(
//     'range',
//     `How far back to get events (default: look back 1000 blocks from tip)`,
//     undefined,
//     types.int
//   )
//   .setAction(async (taskArgs, hre) => {
//     // Connect to the deployed contract
//     const { account } = await getContract(hre, taskArgs.contract);

//     const publicClient = await hre.viem.getPublicClient();

//     const contract = await hre.viem.getContractAt('EffectstreamL2Contract', account);

//     const toBlock = await publicClient.getBlockNumber();
//     const maxRange = taskArgs.range ?? 10000n;
//     const fromBlock = maxRange > toBlock ? 0n : toBlock - maxRange;

//     const eventFilter = await contract.createEventFilter.EffectstreamGameInteraction({
//       fromBlock,
//       toBlock,
//     });
//     const events = await publicClient.getFilterLogs({
//       filter: eventFilter,
//     });

//     const getData = (rawData: `0x${string}`): string => {
//       const tentativeData = decodeAbiParameters([{ type: 'bytes' }], rawData)[0] as string;
//       const textBuffer = Buffer.from(tentativeData.substring('0x'.length), 'hex');
//       try {
//         const decoded = new TextDecoder('utf-8', { fatal: true }).decode(textBuffer);
//         // check if ASCII data
//         if (/^[\x20-\x7E]*$/.test(decoded)) {
//           return decoded;
//         }
//         // cannot be printed in a terminal
//         return tentativeData;
//       } catch (e) {
//         // not a valid utf8 string
//         return tentativeData;
//       }
//     };

//     console.log(
//       events.map(event => ({
//         blockHash: event.blockHash,
//         blockNumber: event.blockNumber,
//         transactionHash: event.transactionHash,
//         address: event.address,
//         data: getData(event.data),
//       }))
//     );
//   });

// task('genDocs', `Generate documentation for tasks of a given scope`)
//   .addParam('scope', 'The scope to generate documentation for')
//   .setAction(async ({ scope }, hre) => {
//     const scopeContent = hre.scopes[scope];
//     console.log(scopeContent);

//     console.log(`# ${scopeContent.description ?? scope}`);
//     console.log(
//       `These are all the [hardhat tasks](https://hardhat.org/hardhat-runner/docs/advanced/create-task) available for the scope \`${scope}\`.`
//     );
//     console.log();
//     console.log(`You can call each of these tasks using \`npx hardhat ${scope} task_name\``);
//     for (const [name, definition] of Object.entries(scopeContent.tasks)) {
//       console.log();
//       console.log(`## \`${name}\``);
//       console.log(definition.description ?? 'No description provided');
//       const parameters = Object.values(definition.paramDefinitions);
//       if (parameters.length > 0) {
//         console.log();
//         console.log('Parameters:');
//         for (const param of parameters) {
//           let annotations = [];
//           if (param.isOptional) {
//             annotations.push(`optional`);
//             if (param.defaultValue != null) {
//               annotations.push(`${param.defaultValue}`);
//             }
//           }
//           if (param.type) {
//             annotations.push(`${param.type.name}`);
//           }
//           const annotationText = annotations.length > 0 ? ` *(${annotations.join(', ')})* ` : '';
//           console.log(
//             `- **${param.name}**${annotationText}: ${
//               param.description ?? 'No description provided'
//             }`
//           );
//         }
//       }
//     }
//   });
