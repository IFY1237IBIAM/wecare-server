# HushCircle Security Email Test Script
# Run: .\test-emails.ps1

$BASE     = "https://wecare-backend-anxl.onrender.com/api"
$EMAIL    = "natalieibiam@gmail.com"
$PASSWORD = "INTERCORe1237#"

$headers = @{ "Content-Type" = "application/json" }

function Pass($msg) { Write-Host "  PASS: $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  FAIL: $msg" -ForegroundColor Red }
function Info($msg) { Write-Host "  INFO: $msg" -ForegroundColor Yellow }
function Section($title) {
    Write-Host ""
    Write-Host "--- $title ---" -ForegroundColor Cyan
}

# STEP 1: Login
Section "STEP 1 - Login"

$token = $null
$pseudonym = $null

try {
    $body = '{"email":"' + $EMAIL + '","password":"' + $PASSWORD + '"}'
    $res  = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST -Headers $headers -Body $body
    $token     = $res.token
    $pseudonym = $res.user.pseudonym
    Pass "Logged in as: $pseudonym"
    Info "Two-step currently enabled: $($res.twoStep)"
} catch {
    Fail "Login failed: $($_.Exception.Message)"
    exit
}

$auth = @{
    "Content-Type"  = "application/json"
    "Authorization" = "Bearer $token"
}

# STEP 2: Check current status
Section "STEP 2 - Current Security Status"

$twoStepEnabled = $false
try {
    $status = Invoke-RestMethod -Uri "$BASE/two-step/status" -Method GET -Headers $auth
    $twoStepEnabled = $status.twoStepEnabled
    Pass "Status fetched"
    Info "twoStepEnabled : $($status.twoStepEnabled)"
    Info "passkeyEnabled : $($status.passkeyEnabled)"
    Info "recoveryUsed   : $($status.recoveryUsed)"
} catch {
    Fail "Status fetch failed: $($_.Exception.Message)"
}

# STEP 3: Enable two-step (triggers enabled email)
Section "STEP 3 - Enable Two-Step"

$recoveryCode = $null

if ($twoStepEnabled -eq $true) {
    Info "Two-step is already ON - skipping enable test"
    Info "Check inbox for a previously received enabled email"
} else {
    try {
        $body = '{"pin":"123456","hint":"test hint"}'
        $res  = Invoke-RestMethod -Uri "$BASE/two-step/enable" -Method POST -Headers $auth -Body $body
        Pass "Two-step enabled"
        Info "Recovery code: $($res.recoveryCode)"
        Info "EMAIL SENT: Two-step verification enabled"
        $recoveryCode   = $res.recoveryCode
        $twoStepEnabled = $true
    } catch {
        Fail "Enable failed: $($_.Exception.Message)"
    }
}

# STEP 4: Change PIN (triggers PIN changed email)
Section "STEP 4 - Change PIN"

if ($twoStepEnabled -eq $true) {
    try {
        $body = '{"currentPin":"123456","newPin":"654321"}'
        $res  = Invoke-RestMethod -Uri "$BASE/two-step/change-pin" -Method POST -Headers $auth -Body $body
        Pass "PIN changed to 654321"
        Info "EMAIL SENT: PIN changed"

        Start-Sleep -Seconds 1

        $body2 = '{"currentPin":"654321","newPin":"123456"}'
        Invoke-RestMethod -Uri "$BASE/two-step/change-pin" -Method POST -Headers $auth -Body $body2 | Out-Null
        Pass "PIN restored to 123456"
        Info "EMAIL SENT: PIN changed again"
    } catch {
        Fail "Change PIN failed: $($_.Exception.Message)"
        Info "Two-step may have been enabled with a different PIN already"
    }
} else {
    Info "Skipping PIN change - two-step not enabled"
}

# STEP 5: Disable two-step (triggers disabled email)
Section "STEP 5 - Disable Two-Step"

if ($twoStepEnabled -eq $true) {
    try {
        $body = '{"pin":"123456"}'
        $res  = Invoke-RestMethod -Uri "$BASE/two-step/disable" -Method POST -Headers $auth -Body $body
        Pass "Two-step disabled"
        Info "EMAIL SENT: Two-step verification disabled"
        $twoStepEnabled = $false
    } catch {
        Fail "Disable failed: $($_.Exception.Message)"
        Info "Try disabling manually in the app Security screen"
    }
} else {
    Info "Skipping disable - two-step not enabled"
}

# STEP 6: Register test passkey (triggers registered email)
Section "STEP 6 - Register Test Passkey"

$passkeyId = $null

try {
    $body = '{"fallback":true,"deviceName":"PowerShell Test Device","deviceId":"ps-test-001"}'
    $res  = Invoke-RestMethod -Uri "$BASE/passkey/register/verify" -Method POST -Headers $auth -Body $body
    Pass "Test passkey registered"
    Info "Passkey ID  : $($res.passkeyId)"
    Info "Device name : $($res.deviceName)"
    Info "Tier        : $($res.tier)"
    Info "EMAIL SENT: New passkey registered"
    $passkeyId = $res.passkeyId
} catch {
    Fail "Passkey register failed: $($_.Exception.Message)"
}

# STEP 7: Delete test passkey (triggers deleted email)
Section "STEP 7 - Delete Test Passkey"

if ($passkeyId) {
    try {
        $res = Invoke-RestMethod -Uri "$BASE/passkey/$passkeyId" -Method DELETE -Headers $auth
        Pass "Test passkey deleted"
        Info "Remaining passkeys: $($res.remaining)"
        Info "EMAIL SENT: Passkey removed"
    } catch {
        Fail "Passkey delete failed: $($_.Exception.Message)"
    }
} else {
    Info "Skipping delete - no passkey ID from previous step"
}

# STEP 8: Verify passkey list is clean
Section "STEP 8 - Verify Passkey List"

try {
    $list = Invoke-RestMethod -Uri "$BASE/passkey/list" -Method GET -Headers $auth
    Pass "Passkey list fetched"
    Info "Registered passkeys: $($list.passkeys.Count)"
    if ($list.passkeys.Count -eq 0) {
        Pass "List is clean - test passkey was removed correctly"
    } else {
        foreach ($pk in $list.passkeys) {
            Info "  -> $($pk.deviceName) | $($pk.tier) | $($pk.createdAt)"
        }
    }
} catch {
    Fail "Passkey list failed: $($_.Exception.Message)"
}

# Summary
Section "DONE"
Write-Host ""
Write-Host "Now check inbox at: $EMAIL" -ForegroundColor Green
Write-Host ""
Write-Host "Expected emails:" -ForegroundColor Yellow
Write-Host "  A. Two-step verification ENABLED"
Write-Host "  B. Two-step PIN CHANGED"
Write-Host "  C. Two-step PIN CHANGED again (restored)"
Write-Host "  D. Two-step verification DISABLED"
Write-Host "  E. New passkey REGISTERED"
Write-Host "  F. Passkey REMOVED"
Write-Host ""
Write-Host "If emails are missing check:" -ForegroundColor Yellow
Write-Host "  - Spam or junk folder"
Write-Host "  - Resend dashboard at resend.com for send logs"
Write-Host "  - NODE_ENV must NOT be development on Render"
Write-Host "  - RESEND_API_KEY must be set correctly on Render"
Write-Host ""