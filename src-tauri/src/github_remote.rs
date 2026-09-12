//! GitHub remote workspace helpers: token keyring, clone, commit, push.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager};

const KEYRING_SERVICE: &str = "ink";
const KEYRING_ACCOUNT: &str = "github-pat";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneResult {
    pub root_path: String,
    pub owner: String,
    pub repo: String,
    pub url: String,
    pub branch: String,
    pub reused_existing: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitResult {
    pub committed: bool,
    pub message: String,
    pub skipped_empty: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteStatus {
    pub branch: String,
    pub dirty: bool,
    pub owner: String,
    pub repo: String,
}

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|e| e.to_string())
}

pub fn get_token() -> Result<Option<String>, String> {
    match keyring_entry()?.get_password() {
        Ok(token) if !token.trim().is_empty() => Ok(Some(token)),
        Ok(_) => Ok(None),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn set_token(token: String) -> Result<(), String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return Err("Token cannot be empty".into());
    }
    keyring_entry()?
        .set_password(trimmed)
        .map_err(|e| e.to_string())
}

pub fn clear_token() -> Result<(), String> {
    match keyring_entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn has_token() -> Result<bool, String> {
    Ok(get_token()?.is_some())
}

fn ensure_git() -> Result<(), String> {
    let output = Command::new("git").arg("--version").output().map_err(|_| {
        "Git is not installed or not on PATH. Install Git to use Open Remote.".to_string()
    })?;
    if !output.status.success() {
        return Err("Git is not available on this system.".into());
    }
    Ok(())
}

fn run_git(repo: Option<&Path>, args: &[&str]) -> Result<std::process::Output, String> {
    let mut cmd = Command::new("git");
    if let Some(path) = repo {
        cmd.arg("-C").arg(path);
    }
    cmd.args(args);
    cmd.output().map_err(|e| format!("Failed to run git: {e}"))
}

fn run_git_checked(repo: Option<&Path>, args: &[&str]) -> Result<String, String> {
    let output = run_git(repo, args)?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        Err(map_git_error(&detail))
    }
}

fn map_git_error(detail: &str) -> String {
    let lower = detail.to_lowercase();
    if lower.contains("authentication failed")
        || lower.contains("invalid username")
        || lower.contains("could not read username")
        || lower.contains("401")
        || lower.contains("403")
        || lower.contains("access denied")
        || lower.contains("repository not found")
    {
        format!(
            "Token missing or lacks repo access. Add a GitHub PAT with repo scope in Settings. ({detail})"
        )
    } else if detail.is_empty() {
        "Git command failed".into()
    } else {
        detail.to_string()
    }
}

/// Parse `owner/repo`, HTTPS, or SSH GitHub URLs into (owner, repo).
pub fn parse_github_repo(input: &str) -> Result<(String, String), String> {
    let trimmed = input.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Enter a GitHub repository as owner/repo or a URL".into());
    }

    if let Some(rest) = trimmed.strip_prefix("git@github.com:") {
        let path = rest.trim_end_matches(".git");
        return split_owner_repo(path);
    }

    for prefix in [
        "https://github.com/",
        "http://github.com/",
        "https://www.github.com/",
        "http://www.github.com/",
    ] {
        if let Some(rest) = trimmed.strip_prefix(prefix) {
            let path = rest.split('?').next().unwrap_or(rest);
            let path = path.split('#').next().unwrap_or(path);
            let path = path.trim_end_matches(".git");
            return split_owner_repo(path);
        }
    }

    split_owner_repo(trimmed)
}

fn split_owner_repo(path: &str) -> Result<(String, String), String> {
    let parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
    if parts.len() < 2 {
        return Err("Expected owner/repo (e.g. octocat/Hello-World)".into());
    }
    let owner = parts[0].to_string();
    let repo = parts[1].trim_end_matches(".git").to_string();
    if owner.is_empty() || repo.is_empty() {
        return Err("Invalid owner/repo".into());
    }
    if owner.contains(':') || repo.contains(':') {
        return Err("Invalid GitHub repository path".into());
    }
    Ok((owner, repo))
}

fn clean_remote_url(owner: &str, repo: &str) -> String {
    format!("https://github.com/{owner}/{repo}.git")
}

fn clone_dest(app: &AppHandle, owner: &str, repo: &str) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data directory: {e}"))?;
    let dest = app_data.join("remote-repos").join(owner).join(repo);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    Ok(dest)
}

fn auth_header_value(token: &str) -> String {
    use std::io::Write;
    let mut buf = Vec::new();
    write!(&mut buf, "x-access-token:{token}").ok();
    format!("Authorization: Basic {}", base64_encode(&buf))
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

fn run_git_with_token(
    repo: Option<&Path>,
    args: &[&str],
    token: Option<&str>,
) -> Result<String, String> {
    let mut cmd = Command::new("git");
    if let Some(path) = repo {
        cmd.arg("-C").arg(path);
    }
    // Avoid interactive credential prompts in the desktop app.
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.env("GCM_INTERACTIVE", "never");
    if let Some(token) = token {
        let header = auth_header_value(token);
        cmd.args(["-c", &format!("http.extraHeader={header}")]);
    }
    cmd.args(args);
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        Err(map_git_error(&detail))
    }
}

fn current_branch(repo: &Path) -> Result<String, String> {
    let branch = run_git_checked(Some(repo), &["rev-parse", "--abbrev-ref", "HEAD"])?;
    if branch.is_empty() || branch == "HEAD" {
        Ok("main".into())
    } else {
        Ok(branch)
    }
}

fn ensure_commit_identity(repo: &Path) -> Result<(), String> {
    let name = run_git(Some(repo), &["config", "user.name"])
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();
    let email = run_git(Some(repo), &["config", "user.email"])
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();

    if name.is_empty() {
        run_git_checked(Some(repo), &["config", "user.name", "Ink"])?;
    }
    if email.is_empty() {
        run_git_checked(Some(repo), &["config", "user.email", "ink@local"])?;
    }
    Ok(())
}

pub fn validate_token() -> Result<String, String> {
    ensure_git()?;
    let token = get_token()?.ok_or_else(|| {
        "No GitHub token saved. Add a Personal Access Token in Settings.".to_string()
    })?;
    if token.len() < 8 {
        return Err("Token looks too short. Paste a full GitHub Personal Access Token.".into());
    }
    Ok("Token is saved. It will be verified when you open a private repo or push.".into())
}

pub fn clone_github_repo(app: AppHandle, input: String) -> Result<CloneResult, String> {
    ensure_git()?;
    let (owner, repo) = parse_github_repo(&input)?;
    let dest = clone_dest(&app, &owner, &repo)?;
    let clean_url = clean_remote_url(&owner, &repo);
    let token = get_token()?;

    if dest.join(".git").is_dir() {
        // Ensure remote URL has no embedded credentials.
        let _ = run_git_checked(Some(&dest), &["remote", "set-url", "origin", &clean_url]);
        let branch = current_branch(&dest).unwrap_or_else(|_| "main".into());
        return Ok(CloneResult {
            root_path: dest.to_string_lossy().to_string(),
            owner,
            repo,
            url: clean_url,
            branch,
            reused_existing: true,
        });
    }

    if dest.exists() {
        let is_empty = fs::read_dir(&dest)
            .map(|mut d| d.next().is_none())
            .unwrap_or(false);
        if !is_empty {
            return Err(format!(
                "Clone destination already exists and is not a git repo: {}",
                dest.display()
            ));
        }
        let _ = fs::remove_dir(&dest);
    }

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    run_git_with_token(
        None,
        &["clone", "--", &clean_url, &dest.to_string_lossy()],
        token.as_deref(),
    )?;

    // Keep origin credential-free; auth is injected per-command.
    let _ = run_git_checked(Some(&dest), &["remote", "set-url", "origin", &clean_url]);
    let branch = current_branch(&dest).unwrap_or_else(|_| "main".into());

    Ok(CloneResult {
        root_path: dest.to_string_lossy().to_string(),
        owner,
        repo,
        url: clean_url,
        branch,
        reused_existing: false,
    })
}

pub fn git_commit_paths(
    repo_path: String,
    paths: Vec<String>,
    message: String,
) -> Result<CommitResult, String> {
    ensure_git()?;
    let repo = PathBuf::from(&repo_path);
    if !repo.join(".git").is_dir() {
        return Err("Not a git repository".into());
    }
    if paths.is_empty() {
        return Err("No paths to commit".into());
    }
    let msg = message.trim();
    if msg.is_empty() {
        return Err("Commit message cannot be empty".into());
    }

    ensure_commit_identity(&repo)?;

    let mut add_args = vec!["add", "--"];
    let path_refs: Vec<&str> = paths.iter().map(|p| p.as_str()).collect();
    add_args.extend(path_refs.iter().copied());
    run_git_checked(Some(&repo), &add_args)?;

    // Skip empty commits.
    let status = run_git_checked(Some(&repo), &["status", "--porcelain"])?;
    if status.is_empty() {
        return Ok(CommitResult {
            committed: false,
            message: msg.to_string(),
            skipped_empty: true,
        });
    }

    run_git_checked(Some(&repo), &["commit", "-m", msg])?;
    Ok(CommitResult {
        committed: true,
        message: msg.to_string(),
        skipped_empty: false,
    })
}

pub fn git_push(repo_path: String) -> Result<(), String> {
    ensure_git()?;
    let repo = PathBuf::from(&repo_path);
    if !repo.join(".git").is_dir() {
        return Err("Not a git repository".into());
    }
    let token = get_token()?;
    run_git_with_token(Some(&repo), &["push"], token.as_deref())?;
    Ok(())
}

pub fn get_remote_repo_status(repo_path: String) -> Result<RemoteStatus, String> {
    ensure_git()?;
    let repo = PathBuf::from(&repo_path);
    if !repo.join(".git").is_dir() {
        return Err("Not a git repository".into());
    }
    let branch = current_branch(&repo)?;
    let status = run_git_checked(Some(&repo), &["status", "--porcelain"])?;
    let remote_url =
        run_git_checked(Some(&repo), &["remote", "get-url", "origin"]).unwrap_or_default();
    let (owner, repo_name) = parse_github_repo(&remote_url).unwrap_or_else(|_| {
        (
            "?".into(),
            repo.file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "repo".into()),
        )
    });
    Ok(RemoteStatus {
        branch,
        dirty: !status.is_empty(),
        owner,
        repo: repo_name,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_owner_repo() {
        assert_eq!(
            parse_github_repo("octocat/Hello-World").unwrap(),
            ("octocat".into(), "Hello-World".into())
        );
    }

    #[test]
    fn parses_https_url() {
        assert_eq!(
            parse_github_repo("https://github.com/octocat/Hello-World.git").unwrap(),
            ("octocat".into(), "Hello-World".into())
        );
    }

    #[test]
    fn parses_ssh_url() {
        assert_eq!(
            parse_github_repo("git@github.com:octocat/Hello-World.git").unwrap(),
            ("octocat".into(), "Hello-World".into())
        );
    }
}
