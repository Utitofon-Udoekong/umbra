import {
  canonicalTenantName,
  getNodeUrl,
  getScriptVersion,
  type T3nClient,
} from "@terminal3/t3n-sdk";
import { CONTRACT_TAIL } from "./contract.js";

export async function issueScopedGrant(
  userClient: T3nClient,
  tenantDid: string,
  agentDid: string,
  functions: string[],
  allowedHosts: string[] = [],
): Promise<void> {
  const scriptName = canonicalTenantName(tenantDid, CONTRACT_TAIL);
  const scriptVersion = await getScriptVersion(getNodeUrl(), scriptName);

  await userClient.execute({
    script_name: "tee:user/contracts",
    script_version: await getScriptVersion(getNodeUrl(), "tee:user/contracts"),
    function_name: "agent-auth-update",
    input: {
      agents: [
        {
          agentDid,
          scripts: [
            {
              scriptName,
              versionReq: scriptVersion,
              functions,
              allowedHosts,
            },
          ],
        },
      ],
    },
  });
}
