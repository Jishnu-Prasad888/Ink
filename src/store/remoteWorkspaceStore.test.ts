import { describe, expect, it } from "vitest";
import { isPathUnderRemoteRoot, relativePathUnderRoot } from "./remoteWorkspaceStore";

describe("remoteWorkspaceStore path helpers", () => {
  it("detects files under a remote root", () => {
    expect(isPathUnderRemoteRoot("/data/remote-repos/a/b/note.md", "/data/remote-repos/a/b")).toBe(
      true,
    );
    expect(
      isPathUnderRemoteRoot("/data/remote-repos/a/other/note.md", "/data/remote-repos/a/b"),
    ).toBe(false);
  });

  it("builds relative commit paths", () => {
    expect(
      relativePathUnderRoot("/data/remote-repos/a/b/docs/readme.md", "/data/remote-repos/a/b"),
    ).toBe("docs/readme.md");
  });
});
