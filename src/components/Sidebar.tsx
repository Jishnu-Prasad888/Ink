// components/Sidebar.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useTabStore } from "../store/tabStore";
import { useRecentFilesStore } from "../store/recentFilesStore";
import {
  isRemotePath,
  parseRemotePath,
  useRemoteWorkspaceStore,
} from "../store/remoteWorkspaceStore";
import {
  ChevronIcon,
  CloseFolderIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
} from "./Icons";

interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  onRequestOpenRemote?: () => void;
  /** When set, Explorer opens this folder as the workspace root. */
  externalRootPath?: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  onError,
  onRequestOpenRemote,
  externalRootPath,
}) => {
  const [rootFolder, setRootFolder] = useState<string | null>(() =>
    localStorage.getItem("sidebar-root-folder"),
  );
  const [tree, setTree] = useState<FileNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const requestGeneration = useRef(0);
  const lastExternalRoot = useRef<string | null>(null);
  const addTab = useTabStore((state) => state.addTab);
  const addRecentFile = useRecentFilesStore((state) => state.addRecentFile);
  const clearActiveRemoteIfRoot = useRemoteWorkspaceStore((state) => state.clearActiveRemoteIfRoot);
  const setActiveRemote = useRemoteWorkspaceStore((state) => state.setActiveRemote);
  const activeFilePath = useTabStore(
    (state) => state.tabs.find((tab) => tab.id === state.activeTabId)?.filePath,
  );

  const isRemoteRoot = rootFolder ? isRemotePath(rootFolder) : false;

  const openWorkspaceRoot = useCallback((folderPath: string) => {
    requestGeneration.current += 1;
    setTree([]);
    setExpanded(new Set());
    setRootFolder(folderPath);
    localStorage.setItem("sidebar-root-folder", folderPath);
  }, []);

  const buildTree = useCallback(
    async (folderPath: string): Promise<FileNode[]> => {
      const virtual = isRemotePath(folderPath) ? parseRemotePath(folderPath) : null;
      const build = async (currentPath: string): Promise<FileNode[]> => {
        let entries: FileNode[];
        if (virtual) {
          const listPath = currentPath === folderPath ? "" : currentPath;
          entries = await invoke<FileNode[]>("github_list_dir", {
            owner: virtual.owner,
            repo: virtual.repo,
            path: listPath,
            branch: virtual.branch,
          });
        } else {
          entries = await invoke<FileNode[]>("read_dir", { path: currentPath });
        }
        const nodes: FileNode[] = [];
        for (const entry of entries) {
          const node: FileNode = {
            name: entry.name,
            path: entry.path,
            is_dir: entry.is_dir,
          };
          if (entry.is_dir && expanded.has(entry.path)) {
            node.children = await build(entry.path);
          }
          nodes.push(node);
        }
        return nodes;
      };
      return build(folderPath);
    },
    [expanded],
  );

  const loadTree = useCallback(
    async (folderPath: string) => {
      const generation = ++requestGeneration.current;
      try {
        const nodes = await buildTree(folderPath);
        if (generation !== requestGeneration.current) return;
        setTree(nodes);
        setRootFolder(folderPath);
        localStorage.setItem("sidebar-root-folder", folderPath);
      } catch (error) {
        if (generation !== requestGeneration.current) return;
        console.error("Failed to load folder:", error);
        onError(`Could not load folder: ${String(error)}`);
      }
    },
    [buildTree, onError],
  );

  useEffect(() => {
    if (!rootFolder) return;
    const generation = ++requestGeneration.current;
    buildTree(rootFolder)
      .then((nodes) => {
        if (generation === requestGeneration.current) setTree(nodes);
      })
      .catch((error) => {
        if (generation === requestGeneration.current) {
          onError(`Could not refresh folder: ${String(error)}`);
        }
      });
    return () => {
      if (generation === requestGeneration.current) requestGeneration.current += 1;
    };
  }, [buildTree, onError, rootFolder]);

  useEffect(() => {
    if (!externalRootPath) return;
    if (lastExternalRoot.current === externalRootPath) return;
    lastExternalRoot.current = externalRootPath;
    openWorkspaceRoot(externalRootPath);
  }, [externalRootPath, openWorkspaceRoot]);

  const handleOpenFolder = async () => {
    try {
      const selected: string[] = await invoke("open_folder_dialog");
      if (selected.length > 0) {
        setActiveRemote(null);
        openWorkspaceRoot(selected[0]);
      }
    } catch (error) {
      onError(`Could not open folder: ${String(error)}`);
    }
  };

  const handleCloseFolder = () => {
    clearActiveRemoteIfRoot(rootFolder);
    requestGeneration.current += 1;
    setRootFolder(null);
    setTree([]);
    setExpanded(new Set());
    localStorage.removeItem("sidebar-root-folder");
  };

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) newSet.delete(path);
      else newSet.add(path);
      return newSet;
    });
  };

  const handleFileClick = async (node: FileNode) => {
    if (node.is_dir) return;
    const existingTab = useTabStore.getState().tabs.find((t) => t.filePath === node.path);
    if (existingTab) {
      useTabStore.getState().setActiveTab(existingTab.id);
      addRecentFile(node.path, node.name);
      return;
    }
    if (isRemoteRoot && rootFolder) {
      const virtual = parseRemotePath(rootFolder);
      if (!virtual) {
        onError("Could not resolve the remote repository.");
        return;
      }
      const filePath = `${rootFolder}/${node.path}`;
      const existingRemoteTab = useTabStore.getState().tabs.find((t) => t.filePath === filePath);
      if (existingRemoteTab) {
        useTabStore.getState().setActiveTab(existingRemoteTab.id);
        addRecentFile(filePath, node.name);
        return;
      }
      try {
        const result = await invoke<{ content: string; sha: string; size: number }>(
          "github_read_file",
          {
            owner: virtual.owner,
            repo: virtual.repo,
            branch: virtual.branch,
            path: node.path,
          },
        );
        addTab({
          type: "markdown",
          filePath,
          fileName: node.name,
          content: result.content,
          mode: "edit",
          isDirty: false,
          diskModifiedAt: 0,
          diskFingerprint: result.sha,
        });
        addRecentFile(filePath, node.name);
      } catch (error) {
        onError(`Could not open ${node.name}: ${String(error)}`);
      }
      return;
    }
    if (node.name.toLowerCase().endsWith(".pdf")) {
      addTab({
        type: "pdf",
        filePath: node.path,
        fileName: node.name,
        content: null,
        mode: "view",
        isDirty: false,
      });
      addRecentFile(node.path, node.name);
    } else {
      try {
        const [content, info] = await Promise.all([
          invoke<string>("read_file", { path: node.path }),
          invoke<{ modified: number; fingerprint: string }>("get_file_info", {
            path: node.path,
          }),
        ]);
        addTab({
          type: "markdown",
          filePath: node.path,
          fileName: node.name,
          content,
          mode: "edit",
          isDirty: false,
          diskModifiedAt: info.modified,
          diskFingerprint: info.fingerprint,
        });
        addRecentFile(node.path, node.name);
      } catch (error) {
        onError(`Could not open ${node.name}: ${String(error)}`);
      }
    }
  };

  const handleCreateFile = async (parentPath: string, name: string) => {
    if (!name.trim()) return;
    try {
      await invoke("create_file", { parentPath, name });
      if (rootFolder) await loadTree(rootFolder);
    } catch (error) {
      onError(`Could not create file: ${String(error)}`);
    }
  };

  const handleCreateFolder = async (parentPath: string, name: string) => {
    if (!name.trim()) return;
    try {
      await invoke("create_dir", { parentPath, name });
      if (rootFolder) await loadTree(rootFolder);
    } catch (error) {
      onError(`Could not create folder: ${String(error)}`);
    }
  };

  const handleDelete = async (path: string) => {
    if (confirm("Delete this item permanently?")) {
      try {
        await invoke("delete_item", { path });
        if (rootFolder) await loadTree(rootFolder);
      } catch (error) {
        onError(`Could not delete item: ${String(error)}`);
      }
    }
  };

  const renderTree = (nodes: FileNode[], level = 0) => {
    return nodes.map((node) => {
      const isExpanded = node.is_dir && expanded.has(node.path);
      const fullPath = isRemoteRoot && rootFolder ? `${rootFolder}/${node.path}` : node.path;
      const isSelected = !node.is_dir && activeFilePath === fullPath;
      return (
        <ContextMenu.Root key={node.path}>
          <ContextMenu.Trigger asChild>
            <div
              className={`sidebar-item${isSelected ? " sidebar-item--selected" : ""}`}
              role="treeitem"
              tabIndex={0}
              aria-expanded={node.is_dir ? isExpanded : undefined}
              aria-selected={isSelected}
              aria-level={level + 1}
              title={fullPath}
              style={{ paddingLeft: `${level * 16 + 12}px` }}
              onClick={() => (node.is_dir ? toggleExpand(node.path) : handleFileClick(node))}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (node.is_dir) toggleExpand(node.path);
                  else void handleFileClick(node);
                } else if (event.key === "ArrowRight" && node.is_dir) {
                  event.preventDefault();
                  if (!isExpanded) toggleExpand(node.path);
                } else if (event.key === "ArrowLeft" && node.is_dir) {
                  event.preventDefault();
                  if (isExpanded) toggleExpand(node.path);
                }
              }}
            >
              <span
                className={`sidebar-disclosure${isExpanded ? " sidebar-disclosure--expanded" : ""}`}
                aria-hidden="true"
              >
                {node.is_dir && <ChevronIcon />}
              </span>
              {node.is_dir ? (
                <span className="sidebar-icon">
                  {isExpanded ? <FolderOpenIcon /> : <FolderIcon />}
                </span>
              ) : (
                <span className="sidebar-icon">
                  <FileIcon />
                </span>
              )}
              <span className="sidebar-name">{node.name}</span>
            </div>
          </ContextMenu.Trigger>
          {isExpanded && node.children && (
            <div className="sidebar-children" role="group">
              {node.children.length > 0 ? (
                renderTree(node.children, level + 1)
              ) : (
                <div
                  className="sidebar-empty-folder"
                  style={{ paddingLeft: `${(level + 1) * 16 + 28}px` }}
                >
                  Empty folder
                </div>
              )}
            </div>
          )}
          {!isRemoteRoot && (
            <ContextMenu.Portal>
              <ContextMenu.Content className="context-menu-content">
                {node.is_dir && (
                  <>
                    <ContextMenu.Item
                      className="context-menu-item"
                      onSelect={() => {
                        const newName = prompt("Enter file name (without extension)");
                        if (newName) void handleCreateFile(node.path, newName);
                      }}
                    >
                      <PlusIcon /> New File
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className="context-menu-item"
                      onSelect={() => {
                        const newName = prompt("Enter folder name");
                        if (newName) void handleCreateFolder(node.path, newName);
                      }}
                    >
                      <FolderPlusIcon /> New Folder
                    </ContextMenu.Item>
                    <ContextMenu.Separator className="context-menu-separator" />
                  </>
                )}
                <ContextMenu.Item
                  className="context-menu-item destructive"
                  onSelect={() => handleDelete(node.path)}
                >
                  <TrashIcon /> Delete
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          )}
        </ContextMenu.Root>
      );
    });
  };

  if (!isOpen) return null;

  return (
    <aside className="sidebar" aria-label="Explorer">
      <div className="sidebar-header">
        <div>
          <h3>Explorer</h3>
          {rootFolder && (
            <span className="sidebar-root" title={rootFolder}>
              {isRemoteRoot
                ? rootFolder.split("/")[2]
                  ? `${rootFolder.split("/")[2]}/${rootFolder.split("/")[3]}`
                  : rootFolder
                : rootFolder.replace(/\\/g, "/").split("/").pop()}
            </span>
          )}
        </div>
        <button className="sidebar-close" onClick={onClose} aria-label="Close Explorer">
          ×
        </button>
      </div>
      <div className="sidebar-toolbar">
        <button onClick={handleOpenFolder} className="sidebar-btn">
          Open Folder
        </button>
        {onRequestOpenRemote && (
          <button onClick={onRequestOpenRemote} className="sidebar-btn">
            Open Remote
          </button>
        )}
        {rootFolder && (
          <>
            {!isRemoteRoot && (
              <>
                <button
                  className="sidebar-icon-btn"
                  title="New Markdown file"
                  aria-label="New Markdown file"
                  onClick={() => {
                    const name = prompt("Enter file name (without extension)");
                    if (name) void handleCreateFile(rootFolder, name);
                  }}
                >
                  <PlusIcon />
                </button>
                <button
                  className="sidebar-icon-btn"
                  title="New folder"
                  aria-label="New folder"
                  onClick={() => {
                    const name = prompt("Enter folder name");
                    if (name) void handleCreateFolder(rootFolder, name);
                  }}
                >
                  <FolderPlusIcon />
                </button>
              </>
            )}
            <button
              className="sidebar-icon-btn"
              title="Refresh Explorer"
              aria-label="Refresh Explorer"
              onClick={() => void loadTree(rootFolder)}
            >
              <RefreshIcon />
            </button>
            <button
              className="sidebar-icon-btn sidebar-close-folder"
              title="Close folder"
              aria-label="Close folder"
              onClick={handleCloseFolder}
            >
              <CloseFolderIcon />
            </button>
          </>
        )}
      </div>
      <div className="sidebar-tree" role="tree" aria-label="Files">
        {rootFolder ? renderTree(tree) : <div className="sidebar-placeholder">No folder open</div>}
      </div>
    </aside>
  );
};
