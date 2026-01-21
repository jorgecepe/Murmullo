# Alert Sound Script for Murmullo Testing
# Plays a beep sound to get user attention

param(
    [string]$Message = "Murmullo necesita tu atencion"
)

# Play system beep sounds (3 beeps)
[console]::beep(800, 200)
Start-Sleep -Milliseconds 100
[console]::beep(1000, 200)
Start-Sleep -Milliseconds 100
[console]::beep(1200, 300)

# Show toast notification if possible
try {
    Add-Type -AssemblyName System.Windows.Forms
    $balloon = New-Object System.Windows.Forms.NotifyIcon
    $balloon.Icon = [System.Drawing.SystemIcons]::Information
    $balloon.BalloonTipIcon = "Info"
    $balloon.BalloonTipTitle = "Murmullo Test"
    $balloon.BalloonTipText = $Message
    $balloon.Visible = $true
    $balloon.ShowBalloonTip(5000)
} catch {
    # Fallback: just use console
    Write-Host "`n`n========================================" -ForegroundColor Yellow
    Write-Host "  MURMULLO NECESITA TU ATENCION" -ForegroundColor Yellow
    Write-Host "  $Message" -ForegroundColor Cyan
    Write-Host "========================================`n" -ForegroundColor Yellow
}
