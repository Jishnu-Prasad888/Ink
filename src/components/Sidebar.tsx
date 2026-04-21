// components/Sidebar.tsx
import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useTabStore } from "../store/tabStore";
import { PlusIcon, TrashIcon, FolderPlusIcon } from "./Icons"; // we'll create simple SVG icons

interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
}

const log = (msg: string, data?: any) => {
  if (import.meta.env.DEV) console.log(`[Sidebar] ${msg}`, data ?? "");
};

export const Sidebar: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
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
    }
  };

  const handleOpenFolder = async () => {
    const selected: string[] = await invoke("open_folder_dialog");
    if (selected && selected.length > 0) {
      await loadTree(selected[0]);
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
    if (node.name.endsWith(".pdf")) {
      addTab({
        type: "pdf",
        filePath: node.path,
        fileName: node.name,
        content: null,
        mode: "view",
        isDirty: false,
      });
    } else {
      // markdown file
      const content: string = await invoke("read_file", { path: node.path });
      addTab({
        type: "markdown",
        filePath: node.path,
        fileName: node.name,
        content,
        mode: "edit",
        isDirty: false,
      });
    }
  };

  const handleCreateFile = async (parentPath: string, name: string) => {
    if (!name.trim()) return;
    await invoke("create_file", { parentPath, name });
    await loadTree(rootFolder!);
  };

  const handleCreateFolder = async (parentPath: string, name: string) => {
    if (!name.trim()) return;
    await invoke("create_dir", { parentPath, name });
    await loadTree(rootFolder!);
  };

  const handleDelete = async (path: string) => {
    if (confirm("Delete this item permanently?")) {
      await invoke("delete_item", { path });
      await loadTree(rootFolder!);
    }
  };

  const renderTree = (nodes: FileNode[], level = 0) => {
    return nodes.map((node) => (
      <ContextMenu.Root key={node.path}>
        <ContextMenu.Trigger asChild>
          <div
            className="sidebar-item"
            style={{ paddingLeft: `${level * 16 + 12}px` }}
            onClick={() =>
              node.is_dir ? toggleExpand(node.path) : handleFileClick(node)
            }
          >
            {node.is_dir ? (
              <span className="sidebar-icon">
                {expanded.has(node.path) ? "📂" : "📁"}
              </span>
            ) : (
              <span className="sidebar-icon">
                {node.name.endsWith(".pdf") ? "📄" : "📝"}
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
            <ContextMenu.Item
              className="context-menu-item"
              onSelect={() => {
                const newName = prompt("Enter file name (without extension)");
                if (newName) handleCreateFile(node.path, newName);
              }}
            >
              <PlusIcon /> New File
            </ContextMenu.Item>
            <ContextMenu.Item
              className="context-menu-item"
              onSelect={() => {
                const newName = prompt("Enter folder name");
                if (newName) handleCreateFolder(node.path, newName);
              }}
            >
              <FolderPlusIcon /> New Folder
            </ContextMenu.Item>
            <ContextMenu.Separator className="context-menu-separator" />
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
    loadChildren();
  }, [rootFolder, expanded]);

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
    <div className="sidebar">
      <div className="sidebar-header">
        <h3>Explorer</h3>
        <button className="sidebar-close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="sidebar-toolbar">
        <button onClick={handleOpenFolder} className="sidebar-btn">
          Open Folder
        </button>
      </div>
      <div className="sidebar-tree">
        {rootFolder ? (
          renderTree(tree)
        ) : (
          <div className="sidebar-placeholder">No folder open</div>
        )}
      </div>
    </div>
  );
};
