# remove-context-menu.ps1
# Run as Administrator

Remove-Item -Path "HKCR\.md\shell\Open with Markdown Editor" -Recurse -Force
Remove-Item -Path "HKCU\Software\Classes\.md" -Recurse -Force

Write-Host "Context menu removed successfully!"