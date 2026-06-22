# Quick disable test - prompts for the exact PIN and tries disable directly
$BASE     = "https://wecare-backend-anxl.onrender.com/api"
$EMAIL    = "test@example.com"
$PASSWORD = "Test@1234"

$headers = @{ "Content-Type" = "application/json" }
$body    = '{"email":"' + $EMAIL + '","password":"' + $PASSWORD + '"}'
$res     = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST -Headers $headers -Body $body
$token   = $res.token

Write-Host "Logged in as: $($res.user.pseudonym)" -ForegroundColor Green

$auth = @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $token" }

$status = Invoke-RestMethod -Uri "$BASE/two-step/status" -Method GET -Headers $auth
Write-Host "Current twoStepEnabled: $($status.twoStepEnabled)" -ForegroundColor Yellow
Write-Host "Current hint: $($status.twoStepHint)" -ForegroundColor Yellow

Write-Host ""
$pin = Read-Host "Enter the EXACT PIN you set when you enabled two-step on this account"

try {
    $body2 = '{"pin":"' + $pin + '"}'
    $res2  = Invoke-RestMethod -Uri "$BASE/two-step/disable" -Method POST -Headers $auth -Body $body2
    Write-Host ""
    Write-Host "SUCCESS: $($res2.message)" -ForegroundColor Green
} catch {
    $stream  = $_.Exception.Response.GetResponseStream()
    $reader  = New-Object System.IO.StreamReader($stream)
    $errBody = $reader.ReadToEnd()
    Write-Host ""
    Write-Host "FAILED: $errBody" -ForegroundColor Red

    if ($errBody -like "*Incorrect PIN*") {
        Write-Host "The PIN you entered does not match what's stored. Try a different PIN," -ForegroundColor Yellow
        Write-Host "or use the recovery code to reset it instead." -ForegroundColor Yellow
    }
}
Write-Host ""