# install-context-menu.ps1
# Run as Administrator

$appPath = Resolve-Path ".\src-tauri\target\release\markdown-editor.exe"

# Add context menu for .md files
$mdKey = "HKCR\.md"
$mdShellKey = "HKCR\.md\shell"
$mdCommandKey = "HKCR\.md\shell\Open with Markdown Editor\command"

# Create registry entries
New-Item -Path $mdKey -Force | Out-Null
Set-ItemProperty -Path $mdKey -Name "(Default)" -Value "markdown" -Force

New-Item -Path $mdShellKey -Force | Out-Null
New-Item -Path "HKCR\.md\shell\Open with Markdown Editor" -Force | Out-Null
Set-ItemProperty -Path "HKCR\.md\shell\Open with Markdown Editor" -Name "(Default)" -Value "Open with Markdown Editor" -Force
Set-ItemProperty -Path "HKCR\.md\shell\Open with Markdown Editor" -Name "Icon" -Value "$appPath" -Force

New-Item -Path $mdCommandKey -Force | Out-Null
Set-ItemProperty -Path $mdCommandKey -Name "(Default)" -Value "`"$appPath`" `"%1`"" -Force

# Add file association
New-Item -Path "HKCU\Software\Classes\.md" -Force | Out-Null
Set-ItemProperty -Path "HKCU\Software\Classes\.md" -Name "(Default)" -Value "markdown" -Force

Write-Host "Context menu installed successfully!"