"use client";
import { useCallback, useState } from "react";
import { branchesApi } from "@/lib/api";

export interface PostOffice {
  Name: string;
  BranchType: string;
  DeliveryStatus: string;
  District: string;
  State: string;
  Pincode: string;
}

export function usePincodeLookup() {
  const [results, setResults] = useState<PostOffice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async (code: string) => {
    if (!code) return;
    setLoading(true);
    setError(null);
    try {
      const res = await branchesApi.lookupPincode(code);
      const first = res && res.length > 0 ? res[0] : null;
      if (!first || !first.PostOffice) {
        setResults([]);
        setError("No post offices found for this pincode");
      } else {
        setResults(first.PostOffice);
      }
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return { results, loading, error, lookup, clear };
}
