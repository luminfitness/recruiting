"use server";

import { withUser } from "@/lib/db-context";
import { importCandidates, parseCsv, type ColumnMapping, type ImportResult } from "@/lib/import";

export interface ImportActionState {
  status: "idle" | "done" | "error";
  message?: string;
  result?: ImportResult;
}

export async function runImportAction(_prev: ImportActionState, formData: FormData): Promise<ImportActionState> {
  const csv = String(formData.get("csv") ?? "");
  const mappingRaw = String(formData.get("mapping") ?? "{}");
  if (!csv.trim()) return { status: "error", message: "Paste CSV first." };

  let mapping: ColumnMapping;
  try {
    mapping = JSON.parse(mappingRaw);
  } catch {
    return { status: "error", message: "Invalid column mapping." };
  }
  if (mapping.email == null || mapping.firstName == null) {
    return { status: "error", message: "Map at least First name and Email." };
  }

  const { rows } = parseCsv(csv);
  const result = await withUser((tx, _client, user) => importCandidates(tx, user.orgId, mapping, rows));
  return { status: "done", result };
}
