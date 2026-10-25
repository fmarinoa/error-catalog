// one issue, shaped like zod's and Standard Schema's (path segments may be { key })
export interface Issue {
  message: string;
  path?: readonly (PropertyKey | { key: PropertyKey })[];
}

const segment = (part: PropertyKey | { key: PropertyKey }) =>
  String(typeof part === "object" ? part.key : part);

// "<message>: path: issue; path: issue", with no prefix for an issue without a path
export function withIssues(message: string, issues: readonly Issue[]) {
  const lines = issues.map((issue) =>
    issue.path?.length
      ? `${issue.path.map(segment).join(".")}: ${issue.message}`
      : issue.message,
  );
  return lines.length ? `${message}: ${lines.join("; ")}` : message;
}
