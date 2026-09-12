//! GitHub remote workspace helpers — token keyring and GitHub REST API.

use base64::Engine;
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use reqwest::Client;
use serde::Serialize;
use serde_json::Value;

const KEYRING_SERVICE: &str = "ink";
const KEYRING_ACCOUNT: &str = "github-pat";
const KEYRING_CLIENT_ID_ACCOUNT: &str = "github-oauth-client-id";

const GITHUB_DEVICE_URL: &str = "https://github.com/login/device/code";
const GITHUB_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const GITHUB_OAUTH_SCOPE: &str = "repo";

const PERCENT_SEGMENT: &AsciiSet =
    &NON_ALPHANUMERIC.remove(b'.').remove(b'-').remove(b'_').remove(b'~');

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|e| e.to_string())
}

fn keyring_client_id_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_CLIENT_ID_ACCOUNT).map_err(|e| e.to_string())
}

pub fn set_oauth_client_id(client_id: String) -> Result<(), String> {
    let trimmed = client_id.trim();
    if trimmed.is_empty() {
        return Err("OAuth App client id cannot be empty".into());
    }
    keyring_client_id_entry()?
        .set_password(trimmed)
        .map_err(|e| e.to_string())
}

pub fn get_oauth_client_id() -> Result<Option<String>, String> {
    match keyring_client_id_entry()?.get_password() {
        Ok(id) if !id.trim().is_empty() => Ok(Some(id)),
        Ok(_) => Ok(None),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn require_oauth_client_id() -> Result<String, String> {
    get_oauth_client_id()?.ok_or_else(|| {
        "No GitHub OAuth App client id is set. In Settings, add the client id of a GitHub OAuth App to enable \"Sign in with GitHub\"."
            .to_string()
    })
}

pub fn has_oauth_client_id() -> Result<bool, String> {
    Ok(get_oauth_client_id()?.is_some())
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

pub fn validate_token() -> Result<String, String> {
    let token = get_token()?.ok_or_else(|| {
        "No GitHub token saved. Sign in with GitHub in Settings.".to_string()
    })?;
    if token.len() < 8 {
        return Err("Token looks too short. Sign in again with GitHub.".into());
    }
    Ok("Token is saved. It will be verified when you open a repo.".into())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAuthResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAuthStatus {
    pub authorized: bool,
    /// Empty when fine, or a terminal error code like access_denied / expired_token.
    pub code: String,
    pub message: String,
}

/// Starts the GitHub OAuth device flow and returns the user code to display.
pub async fn start_device_auth() -> Result<DeviceAuthResponse, String> {
    let client_id = require_oauth_client_id()?;
    let client = build_client()?;
    let body = serde_json::json!({
        "client_id": client_id,
        "scope": GITHUB_OAUTH_SCOPE,
    });
    let resp = client
        .post(GITHUB_DEVICE_URL)
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error while starting GitHub sign in: {e}"))?;
    let status_code = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if status_code != 200 {
        let msg = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| {
                v["error_description"]
                    .as_str()
                    .or_else(|| v["error"].as_str())
                    .map(String::from)
            })
            .unwrap_or_else(|| text.clone());
        if status_code == 404 {
            return Err(format!("GitHub does not recognize this OAuth App client id. {msg}"));
        }
        return Err(format!("GitHub sign-in error {status_code}: {msg}"));
    }
    if text.trim().is_empty() {
        return Err("GitHub returned an empty sign-in response.".into());
    }
    let json: Value = serde_json::from_str(&text).map_err(|_| text)?;
    Ok(DeviceAuthResponse {
        device_code: json["device_code"].as_str().unwrap_or_default().to_string(),
        user_code: json["user_code"].as_str().unwrap_or_default().to_string(),
        verification_uri: json["verification_uri"]
            .as_str()
            .unwrap_or("https://github.com/login/device")
            .to_string(),
        expires_in: json["expires_in"].as_u64().unwrap_or(900),
        interval: json["interval"].as_u64().unwrap_or(5).max(1),
    })
}

/// Polls GitHub until the device code is authorized, then stores the token.
pub async fn poll_device_auth(device_code: String) -> Result<DeviceAuthStatus, String> {
    let client_id = require_oauth_client_id()?;
    let client = build_client()?;
    let body = serde_json::json!({
        "client_id": client_id,
        "device_code": device_code,
        "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
    });
    let resp = client
        .post(GITHUB_TOKEN_URL)
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error while polling GitHub: {e}"))?;
    let status_code = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if status_code == 429 || status_code == 403 {
        return Ok(DeviceAuthStatus {
            authorized: false,
            code: "rate_limited".into(),
            message: "GitHub rate-limited the request; retrying…".into(),
        });
    }
    let json: Value = serde_json::from_str(&text).map_err(|_| text)?;
    if let Some(access_token) = json["access_token"].as_str() {
        set_token(access_token.to_string())?;
        return Ok(DeviceAuthStatus {
            authorized: true,
            code: "authorized".into(),
            message: "Signed in to GitHub.".into(),
        });
    }
    let error = json["error"].as_str().unwrap_or("error");
    let message = match error {
        "authorization_pending" => "Waiting for you to authorize in the browser…".into(),
        "slow_down" => "GitHub asked us to slow down; retrying…".into(),
        "access_denied" => "Access denied. You declined the request in the browser.".into(),
        "expired_token" => "This sign-in code expired. Please start again.".into(),
        "incorrect_client_credentials" => "The GitHub OAuth App client id is invalid.".into(),
        other => format!("GitHub sign-in issue: {other}"),
    };
    let terminal = matches!(
        error,
        "access_denied" | "expired_token" | "incorrect_client_credentials"
    );
    Ok(DeviceAuthStatus {
        authorized: false,
        code: if terminal {
            error.to_string()
        } else {
            "pending".to_string()
        },
        message,
    })
}

fn clean_remote_url(owner: &str, repo: &str) -> String {
    format!("https://github.com/{owner}/{repo}")
}

fn api_url(owner: &str, repo: &str, rest: &str) -> String {
    format!("https://api.github.com/repos/{owner}/{repo}/{rest}")
}

fn encode_path(path: &str) -> String {
    path.split('/')
        .map(|seg| utf8_percent_encode(seg, PERCENT_SEGMENT).to_string())
        .collect::<Vec<_>>()
        .join("/")
}

fn build_client() -> Result<Client, String> {
    Client::builder()
        .user_agent("Ink/1.3.1")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))
}

async fn gh_request(
    client: &Client,
    method: reqwest::Method,
    url: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> Result<Value, String> {
    let mut req = client.request(method.clone(), url);
    if let Some(token) = token {
        req = req.header("Authorization", format!("Bearer {token}"));
    }
    if let Some(body) = body {
        req = req.json(&body);
    }
    let resp = req.send().await.map_err(|e| {
        let lower = e.to_string().to_lowercase();
        if lower.contains("connect") || lower.contains("dns") {
            format!("Network error: {e}")
        } else {
            e.to_string()
        }
    })?;
    let status = resp.status();
    let status_code = status.as_u16();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if status.is_success() {
        if text.trim().is_empty() || text.trim() == "{}" {
            Ok(serde_json::json!({}))
        } else {
            serde_json::from_str(&text).map_err(|_| text)
        }
    } else {
        let lower = text.to_lowercase();
        let message = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| v["message"].as_str().map(String::from))
            .unwrap_or_else(|| text.clone());
        if status_code == 401 || status_code == 403 || lower.contains("bad credentials") {
            Err(format!(
                "GitHub authentication failed. Check your token in Settings. ({message})"
            ))
        } else if status_code == 404 {
            Err(format!("Repository or file not found. ({message})"))
        } else if status_code == 409 {
            Err("Conflict: the file changed on GitHub. Reopen the file and try again.".into())
        } else if status_code == 422 {
            Err(format!("GitHub rejected the request. ({message})"))
        } else {
            Err(format!("GitHub API error {status_code}: {message}"))
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub owner: String,
    pub repo: String,
    pub url: String,
    pub branch: String,
    pub root_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFile {
    pub content: String,
    pub sha: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteResult {
    pub sha: String,
    pub committed: bool,
}

fn is_supported_file(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown") || lower.ends_with(".txt")
}

pub async fn open_repo(input: String) -> Result<RepoInfo, String> {
    let (owner, repo) = parse_github_repo(&input)?;
    let client = build_client()?;
    let token = get_token()?;
    let url = api_url(&owner, &repo, "");
    let json = gh_request(&client, reqwest::Method::GET, &url, token.as_deref(), None).await?;
    let default_branch = json
        .get("default_branch")
        .and_then(|v| v.as_str())
        .unwrap_or("main")
        .to_string();
    let url = clean_remote_url(&owner, &repo);
    let root_path = format!("github://{owner}/{repo}/{default_branch}");
    Ok(RepoInfo {
        owner,
        repo,
        url,
        branch: default_branch,
        root_path,
    })
}

pub async fn list_dir(
    owner: String,
    repo: String,
    path: String,
    branch: String,
) -> Result<Vec<TreeEntry>, String> {
    let client = build_client()?;
    let token = get_token()?;
    let encoded = if path.is_empty() {
        String::new()
    } else {
        encode_path(&path)
    };
    let mut url = api_url(&owner, &repo, "contents");
    if !encoded.is_empty() {
        url = format!("{url}/{encoded}");
    }
    url = format!("{url}?ref={}", &branch);
    let json = gh_request(&client, reqwest::Method::GET, &url, token.as_deref(), None).await?;
    let entries = json
        .as_array()
        .ok_or_else(|| "Unexpected response from GitHub".to_string())?;
    let mut result = Vec::new();
    for entry in entries {
        let name = entry["name"].as_str().unwrap_or_default().to_string();
        let entry_path = entry["path"].as_str().unwrap_or_default().to_string();
        let entry_type = entry["type"].as_str().unwrap_or("file");
        let is_dir = entry_type == "dir";
        if is_dir || is_supported_file(&name) {
            result.push(TreeEntry {
                name,
                path: entry_path,
                is_dir,
            });
        }
    }
    result.sort_by(|a, b| {
        if a.is_dir && !b.is_dir {
            std::cmp::Ordering::Less
        } else if !a.is_dir && b.is_dir {
            std::cmp::Ordering::Greater
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });
    Ok(result)
}

pub async fn read_file(
    owner: String,
    repo: String,
    branch: String,
    path: String,
) -> Result<RemoteFile, String> {
    let client = build_client()?;
    let token = get_token()?;
    let encoded = encode_path(&path);
    let url = format!(
        "{base}?ref={branch}",
        base = api_url(&owner, &repo, &format!("contents/{encoded}")),
    );
    let json = gh_request(&client, reqwest::Method::GET, &url, token.as_deref(), None).await?;
    let sha = json
        .get("sha")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let size = json.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
    let encoding = json
        .get("encoding")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let content = if encoding == "base64" {
        let b64 = json
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(b64.replace('\n', ""))
            .map_err(|e| format!("Failed to decode content: {e}"))?;
        String::from_utf8(bytes).map_err(|e| format!("File is not valid UTF-8: {e}"))?
    } else {
        json.get("content")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string()
    };
    Ok(RemoteFile {
        content,
        sha,
        size,
    })
}

pub async fn write_file(
    owner: String,
    repo: String,
    branch: String,
    path: String,
    content: String,
    message: String,
    sha: Option<String>,
) -> Result<WriteResult, String> {
    let client = build_client()?;
    let token = get_token()?;
    let encoded = encode_path(&path);
    let url = api_url(&owner, &repo, &format!("contents/{encoded}"));
    let b64 = base64::engine::general_purpose::STANDARD.encode(content.as_bytes());
    let mut body = serde_json::json!({
        "message": message,
        "content": b64,
        "branch": branch,
    });
    if let Some(sha) = sha {
        body["sha"] = Value::String(sha);
    }
    let json = gh_request(&client, reqwest::Method::PUT, &url, token.as_deref(), Some(body)).await?;
    let new_sha = json
        .pointer("/content/sha")
        .or_else(|| json.pointer("/commit/sha"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Ok(WriteResult {
        sha: new_sha,
        committed: true,
    })
}

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
    Ok((owner, repo))
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
