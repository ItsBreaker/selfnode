/**
 * Client command lines, shared by the node manager and the CI shutdown test so
 * the test exercises exactly the production configuration. Every flag was
 * checked against the shipped binaries' --help.
 *
 * Nethermind (https://docs.nethermind.io/fundamentals/configuration):
 *   --config sepolia                        Sepolia preset (snap sync)
 *   --Sync.DownloadBodiesInFastSync false   no historical block bodies
 *   --Sync.DownloadReceiptsInFastSync false no historical receipts
 *     (database docs: blocks + receipts are 680 of Sepolia's 893 GB)
 *   --History.Pruning Rolling               prune blocks/receipts older than
 *                                           History.RetentionEpochs (82125 minimum)
 *   --Pruning.Mode Hybrid                   in-memory + full state pruning (default)
 *   --Pruning.FullPruningTrigger VolumeFreeSpace  full-prune when free space drops
 *                                           below FullPruningThresholdMb (256000)
 *   --Network.EnableUPnP false              no automatic router port mapping
 *                                           ("Whether to enable automatic port
 *                                           forwarding via UPnP. Defaults to false";
 *                                           set explicitly)
 * Nimbus (https://nimbus.guide):
 *   trustedNodeSync --backfill=false        checkpoint sync, no history backfill
 *   --history=prune                         keep only the required ~5 months
 *   --nat=none                              no UPnP / NAT-PMP (the default `any`
 *                                           tries both; networking guide: "By
 *                                           default, Nimbus uses UPnP")
 * All RPC/Engine/REST endpoints bind to 127.0.0.1; only P2P ports are public.
 */
export const ENGINE_PORT = 8551;
export const EL_RPC_PORT = 8545;
export const CL_REST_PORT = 5052;

export function nethermindArgs(dataDir: string, jwt: string): string[] {
  return [
    "--config",
    "sepolia",
    "--data-dir",
    dataDir,
    "--Sync.DownloadBodiesInFastSync",
    "false",
    "--Sync.DownloadReceiptsInFastSync",
    "false",
    "--History.Pruning",
    "Rolling",
    "--Pruning.Mode",
    "Hybrid",
    "--Pruning.FullPruningTrigger",
    "VolumeFreeSpace",
    "--Network.EnableUPnP",
    "false",
    "--JsonRpc.Enabled",
    "true",
    "--JsonRpc.Host",
    "127.0.0.1",
    "--JsonRpc.Port",
    String(EL_RPC_PORT),
    "--JsonRpc.EngineHost",
    "127.0.0.1",
    "--JsonRpc.EnginePort",
    String(ENGINE_PORT),
    "--JsonRpc.JwtSecretFile",
    jwt,
    "--JsonRpc.EnabledModules",
    "[Eth,Net,Web3,Health,Proof]",
    "--Init.WebSocketsEnabled",
    "false",
    "--HealthChecks.Enabled",
    "false",
    "--Metrics.Enabled",
    "false",
  ];
}

export function nimbusArgs(dataDir: string, jwt: string): string[] {
  return [
    "--network=sepolia",
    `--data-dir=${dataDir}`,
    `--el=http://127.0.0.1:${ENGINE_PORT}`,
    `--jwt-secret=${jwt}`,
    "--history=prune",
    "--nat=none",
    "--rest",
    "--rest-address=127.0.0.1",
    `--rest-port=${CL_REST_PORT}`,
    "--metrics=false",
    "--non-interactive",
  ];
}

export function nimbusCheckpointArgs(dataDir: string, checkpointUrl: string): string[] {
  return [
    "trustedNodeSync",
    "--network=sepolia",
    `--data-dir=${dataDir}`,
    `--trusted-node-url=${checkpointUrl}`,
    "--backfill=false",
  ];
}

/** The lines each client prints when it has finished shutting down cleanly (from their sources). */
export const CLEAN_SHUTDOWN = {
  // Nethermind.Runner/Program.cs: logger.Info("Nethermind is shut down")
  nethermind: /Nethermind is shut down/,
  // nimbus_beacon_node.nim: "Shutting down after having received SIGINT / ctrl-c", then notice "Shutting down"
  // nimbus_beacon_node.nim: notice "Shutting down", then "Databases closed" once storage is flushed
  nimbus: /Databases closed/,
} as const;

/**
 * The exit code each client uses for a clean, interrupt-initiated shutdown.
 * Nethermind: Nethermind.Config/ExitCodes.cs `SigInt = 130; // 128 + 2 (sigint)`.
 * Nimbus: exits 0 after "Databases closed".
 */
export const CLEAN_EXIT_CODE = { nethermind: 130, nimbus: 0 } as const;

/** Nethermind's own exit code for a corrupted database (ExitCodes.cs `DbCorruption = 109`). */
export const NETHERMIND_DB_CORRUPTION_EXIT = 109;

/** Startup failures that mean the client couldn't open its database. */
export const DB_FAILURE = {
  nethermind:
    /(RocksDb|RocksDbSharp|Corruption|database).*(error|exception|corrupt|failed)|Corruption:/i,
  nimbus: /(database|kvstore|sqlite).*(corrupt|malformed|error|failed|cannot open)|malformed/i,
} as const;
