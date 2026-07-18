import { EstimatingSheet } from "./EstimatingSheet";

export function EstimatingTab({ projectId }: { projectId: string }) {
  return <EstimatingSheet projectId={projectId} />;
}
