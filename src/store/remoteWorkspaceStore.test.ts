import { describe, expect, it } from "vitest";
import {
  isPathUnderRemoteRoot,
  isRemotePath,
  parseRemotePath,
  relativePathUnderRoot,
} from "./remoteWorkspaceStore";

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

  it("recognizes virtual GitHub paths", () => {
    expect(isRemotePath("github://octocat/Hello-World/main/docs/readme.md")).toBe(true);
    expect(isRemotePath("/home/user/note.md")).toBe(false);
  });

  it("parses virtual GitHub paths", () => {
    expect(parseRemotePath("github://octocat/Hello-World/main/docs/readme.md")).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      branch: "main",
      relPath: "docs/readme.md",
    });
    expect(parseRemotePath("github://octocat/Hello-World/main/root.md")).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      branch: "main",
      relPath: "root.md",
    });
    expect(parseRemotePath("/home/user/note.md")).toBeNull();
  });

  it("treats a virtual root like any other root", () => {
    const root = "github://octocat/Hello-World/main";
    expect(isPathUnderRemoteRoot(`github://octocat/Hello-World/main/docs/readme.md`, root)).toBe(
      true,
    );
    expect(relativePathUnderRoot("github://octocat/Hello-World/main/docs/readme.md", root)).toBe(
      "docs/readme.md",
    );
  });
});
