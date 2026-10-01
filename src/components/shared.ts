import type { Dispatch, SetStateAction } from "react";
import type { Workspace } from "@/lib/accounting/types";
export type WorkspaceSetter = Dispatch<SetStateAction<Workspace>>;
export type ViewProps = {
  workspace: Workspace;
  setWorkspace: WorkspaceSetter;
  year: number;
  notify: (message: string) => void;
};
