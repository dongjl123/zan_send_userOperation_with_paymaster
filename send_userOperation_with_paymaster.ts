// importing required dependencies
import {
    LightSmartContractAccount,
    getDefaultLightAccountFactoryAddress,
  } from "@alchemy/aa-accounts";
  import { LocalAccountSigner, 
    SmartAccountProvider, 
    type SmartAccountSigner,
    getDefaultEntryPointAddress,
    Logger,
    UserOperationFeeOptions,
    type Hex,
    Address,
    resolveProperties,
    deepHexlify,
    Deferrable,
    UserOperationStruct
  } from "@alchemy/aa-core";
  import { sepolia } from "viem/chains";
  import fetch from 'node-fetch'

  Logger.setLogLevel(4); // Set LogLevel to DEBUG

  const chain = sepolia;

  const rpc_url = "The node service and bundler service url";

  const paymaster_url = "The paymaster service url";

  const PRIVATE_KEY = "The private key of the smart contract account owner" as Hex;

  const targetAddress ="The target address to which you want to send tokens" as Address;

  const policy_id = "The policy id of the paymaster service";

  const eoaSigner: SmartAccountSigner = LocalAccountSigner.privateKeyToAccountSigner(PRIVATE_KEY); // Create a signer for your EOA
  
  const entryPointAddress = getDefaultEntryPointAddress(chain)

  
  
  const userOperationFeeOptions: UserOperationFeeOptions = {
    maxPriorityFeePerGas: {
      min: 10_000_000n,
      percentage: 20,
    },
    maxFeePerGas: {
      percentage: 100,
    }
  };
  
  const provider = new SmartAccountProvider({
    rpcProvider:  rpc_url,
    chain,
    entryPointAddress: entryPointAddress,
    opts: {
      txMaxRetries: 10,
      txRetryIntervalMs: 2_000,
      txRetryMulitplier: 1.5,
      feeOptions: userOperationFeeOptions,
    },
  }).connect(
    (rpcClient) =>
      new LightSmartContractAccount({
        entryPointAddress: entryPointAddress,
        chain: rpcClient.chain,
        owner: eoaSigner,
        factoryAddress: getDefaultLightAccountFactoryAddress(rpcClient.chain), // Default address for Light Account on Sepolia, you can replace it with your own.
        rpcClient,
      })
  );
  
  // Define the DummyPaymasterDataMiddlewareOverrideFunction
  const DummyPaymasterDataMiddlewareOverrideFunction = async (uoStruct) => {
    // Return an object like {paymasterAndData: "0x..."} where "0x..." is the valid paymasterAndData for your paymaster contract (used in gas estimation)
    // You can even hardcode these dummy singatures
    // You can read up more on dummy signatures here: https://www.alchemy.com/blog/dummy-signatures-and-gas-token-transfers
    const userOpDataOverrides = {
      paymasterAndData : "0x7915e08ec9e1e4b08b1ac0b086a568fe5d3ba3220000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006575be1ff188fa178364105814dc4bf270fc20175857d63661d18f12ae3a39d1ae13562e5fa5e68582e8669243e2f63e5b2b22b878ca24e987426558cc280c94556f1e921b" as Hex,
    }
  
    return userOpDataOverrides;
  };
  
  // Define the PaymasterDataMiddlewareOverrideFunction
  const PaymasterDataMiddlewareOverrideFunction = async (uoStruct: Deferrable<UserOperationStruct>) => {
    const paymasterAndData = sendJsonRpcRequest(uoStruct);
    const userOperation = deepHexlify(await resolveProperties(uoStruct));
    const userOpDataOverrides = {
      paymasterAndData: paymasterAndData,
      maxFeePerGas: userOperation.maxFeePerGas,
      maxPriorityFeePerGas:userOperation.maxPriorityFeePerGas,
      callGasLimit:userOperation.callGasLimit,
      verificationGasLimit:userOperation.verificationGasLimit,
      preVerificationGas:userOperation.preVerificationGas,
    }
    return userOpDataOverrides;
  };
  
  const userOpData = {
    target: targetAddress, // Replace with the desired target address
    data: "0x0" as Hex, // Replace with the desired call data
    value: 0n,
  };
  
interface ApiResponse {
  id: number;
  jsonrpc: string;
  result: {
    paymasterAndData: string;
  }
  }

  // send JSON-RPC request to url
async function sendJsonRpcRequest(uoStruct: Deferrable<UserOperationStruct>): Promise<any> {
  // construct JSON-RPC request body
  const requestBody = {
    jsonrpc: "2.0",
    method: "zan_requestPaymasterAndData",
    params: {
      policyId: policy_id,
      entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      userOperation: deepHexlify(await resolveProperties(uoStruct))
    },
    id: new Date().getTime()  // use current timestamp as ID
  };
  try {
    console.log("Request paymasterAndData, the request is:",requestBody);
    // send request
    const response = await fetch(paymaster_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      throw new Error(`Server responded with status code ${response.status}`);
    }
    const result = await response.json() as ApiResponse;
    console.log("Request paymasterAndData, the result is:",result);
    const paymasterAndData =  result.result.paymasterAndData;
    return paymasterAndData;
  } catch (error) {
    console.error('Request failed:', error);
    throw error;
  }
}



  (async () => {
    // Fund your account address with ETH to send for the user operations
    // (e.g. Get Sepolia ETH at https://sepoliafaucet.com)
    console.log("Smart Account Address: ", await provider.getAddress()); // Log the smart account address


    provider.withPaymasterMiddleware({
      dummyPaymasterDataMiddleware: DummyPaymasterDataMiddlewareOverrideFunction,
      paymasterDataMiddleware: PaymasterDataMiddlewareOverrideFunction,
    });

    const resultingUO  = await provider.buildUserOperation(userOpData);
    console.log("Sending UserOperation: ", resultingUO);

  // Send a user operation from your smart contract account
  const opHashResult = await provider.sendUserOperation(userOpData);
  console.log("Resulting UserOperation: ", opHashResult); // Log the user operation hash
  console.log(`Checkout https://jiffyscan.xyz/userOpHash/${opHashResult.hash}?network=${chain.name}`)
  
  
    // Wait for the user operation to be mined
    const txHash = await provider.waitForUserOperationTransaction(opHashResult.hash);
  
    console.log("Transaction Hash: ", txHash); // Log the transaction hash
  })();