import { ApiError } from "@/lib/api";

// Factors out the `err instanceof ApiError ? err.message : fallback` ternary
// repeated across the app. Also unwraps plain Error (thrown by client-side
// helpers like autoCreateBranchForClinic) before falling back.
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
