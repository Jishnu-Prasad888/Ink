// components/Sidebar.tsx
import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useTabStore } from "../store/tabStore";
import {
  FileIcon,
  FolderIcon,
  FolderPlusIcon,
  PlusIcon,
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
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  onError,
}) => {
  const [rootFolder, setRootFolder] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const addTab = useTabStore((state) => state.addTab);

  // Load saved root folder from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-root-folder");
    if (saved) {
      setRootFolder(saved);
      loadTree(saved);
    }
  }, []);

  const loadTree = async (folderPath: string) => {
    try {
      const entries: any[] = await invoke("read_dir", { path: folderPath });
      const nodes: FileNode[] = entries.map((e) => ({
        name: e.name,
        path: e.path,
        is_dir: e.is_dir,
      }));
      setTree(nodes);
      setRootFolder(folderPath);
      localStorage.setItem("sidebar-root-folder", folderPath);
    } catch (err) {
      console.error("Failed to load folder:", err);
      onError(`Could not load folder: ${String(err)}`);
    }
  };

  const handleOpenFolder = async () => {
    try {
      const selected: string[] = await invoke("open_folder_dialog");
      if (selected.length > 0) await loadTree(selected[0]);
    } catch (error) {
      onError(`Could not open folder: ${String(error)}`);
    }
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
    const existingTab = useTabStore
      .getState()
      .tabs.find((t) => t.filePath === node.path);
    if (existingTab) {
      useTabStore.getState().setActiveTab(existingTab.id);
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
    return nodes.map((node) => (
      <ContextMenu.Root key={node.path}>
        <ContextMenu.Trigger asChild>
          <div
            className="sidebar-item"
            role="treeitem"
            tabIndex={0}
            aria-expanded={node.is_dir ? expanded.has(node.path) : undefined}
            aria-level={level + 1}
            style={{ paddingLeft: `${level * 16 + 12}px` }}
            onClick={() =>
              node.is_dir ? toggleExpand(node.path) : handleFileClick(node)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (node.is_dir) toggleExpand(node.path);
                else void handleFileClick(node);
              } else if (event.key === "ArrowRight" && node.is_dir) {
                event.preventDefault();
                if (!expanded.has(node.path)) toggleExpand(node.path);
              } else if (event.key === "ArrowLeft" && node.is_dir) {
                event.preventDefault();
                if (expanded.has(node.path)) toggleExpand(node.path);
              }
            }}
          >
            {node.is_dir ? (
              <span className="sidebar-icon">
                <FolderIcon />
              </span>
            ) : (
              <span className="sidebar-icon">
                <FileIcon />
              </span>
            )}
            <span className="sidebar-name">{node.name}</span>
          </div>
        </ContextMenu.Trigger>
        {node.is_dir && expanded.has(node.path) && node.children && (
          <div className="sidebar-children">
            {renderTree(node.children, level + 1)}
          </div>
        )}
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
      </ContextMenu.Root>
    ));
  };

  // We need to load children on expand – for simplicity, we load recursively upfront.
  // For a more efficient implementation we'd lazy load, but for demo we load all.
  // We'll add a useEffect that loads children when expanded changes.
  useEffect(() => {
    const loadChildren = async () => {
      if (!rootFolder) return;
      const newTree = await buildTree(rootFolder);
      setTree(newTree);
    };
    loadChildren().catch((error) => {
      onError(`Could not refresh folder: ${String(error)}`);
    });
  }, [rootFolder, expanded, onError]);

  const buildTree = async (folderPath: string): Promise<FileNode[]> => {
    const entries: any[] = await invoke("read_dir", { path: folderPath });
    const nodes: FileNode[] = [];
    for (const e of entries) {
      const node: FileNode = {
        name: e.name,
        path: e.path,
        is_dir: e.is_dir,
      };
      if (e.is_dir && expanded.has(e.path)) {
        node.children = await buildTree(e.path);
      }
      nodes.push(node);
    }
    return nodes;
  };

  if (!isOpen) return null;

  return (
    <aside className="sidebar" aria-label="Explorer">
      <div className="sidebar-header">
        <div>
          <h3>Explorer</h3>
          {rootFolder && (
            <span className="sidebar-root" title={rootFolder}>
              {rootFolder.replace(/\\/g, "/").split("/").pop()}
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
        {rootFolder && (
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
            <button
              className="sidebar-icon-btn"
              title="Refresh Explorer"
              aria-label="Refresh Explorer"
              onClick={() => void loadTree(rootFolder)}
            >
              ↻
            </button>
          </>
        )}
      </div>
      <div className="sidebar-tree" role="tree" aria-label="Files">
        {rootFolder ? (
          renderTree(tree)
        ) : (
          <div className="sidebar-placeholder">No folder open</div>
        )}
      </div>
    </aside>
  );
};
