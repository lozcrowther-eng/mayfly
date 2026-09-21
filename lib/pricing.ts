// Vercel Sandbox pricing — https://vercel.com/docs/sandbox/pricing
export const CPU_HOUR_RATE_USD = 0.128; // per active-CPU-hour
export const GB_HOUR_RATE_USD = 0.0212; // per GB-hour of memory

// Sandbox allocates 2048 MB of RAM per vCPU (see @vercel/sandbox's `resources.vcpus` docs) —
// not billed separately, but memory cost is still vCPU-derived, not a free-standing input.
const MEMORY_GB_PER_VCPU = 2;

export interface CostEstimate {
  cpuHours: number;
  cpuCostUsd: number;
  memoryCostUsd: number;
  totalUsd: number;
}

/** Cost accrued so far for a still-running instance — measured against elapsed time, not projected against its TTL. */
export function estimateCost(vcpus: number, elapsedMs: number): CostEstimate {
  const hours = elapsedMs / (60 * 60 * 1000);
  const cpuHours = vcpus * hours;
  const cpuCostUsd = cpuHours * CPU_HOUR_RATE_USD;
  const memoryCostUsd = vcpus * MEMORY_GB_PER_VCPU * hours * GB_HOUR_RATE_USD;
  return { cpuHours, cpuCostUsd, memoryCostUsd, totalUsd: cpuCostUsd + memoryCostUsd };
}
