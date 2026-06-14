import {
  canonicalTenantName,
  getNodeUrl,
  getScriptVersion,
  type T3nClient,
  type TenantClient,
} from "@terminal3/t3n-sdk";

export const CONTRACT_TAIL = "umbra";

export async function getContractVersion(tenantDid: string): Promise<string> {
  const scriptName = canonicalTenantName(tenantDid, CONTRACT_TAIL);
  return getScriptVersion(getNodeUrl(), scriptName);
}

export async function executeAsTenant<T>(
  tenant: TenantClient,
  tenantDid: string,
  functionName: string,
  input: unknown,
): Promise<T> {
  const version = await getContractVersion(tenantDid);
  const result = await tenant.contracts.execute(CONTRACT_TAIL, {
    version,
    functionName,
    input,
  });
  return result as T;
}

export async function executeAsAgent<T>(
  t3n: T3nClient,
  tenantDid: string,
  functionName: string,
  input: unknown,
): Promise<T> {
  const scriptName = canonicalTenantName(tenantDid, CONTRACT_TAIL);
  const scriptVersion = await getScriptVersion(getNodeUrl(), scriptName);
  return t3n.executeAndDecode<T>({
    script_name: scriptName,
    script_version: scriptVersion,
    function_name: functionName,
    input,
  });
}
