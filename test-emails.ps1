# HushCircle Security Email Test Script v2
# Fixes: disable uses correct PIN flow, passkey uses separate debug step
# Run: .\test-emails.ps1

$BASE     = "https://wecare-backend-anxl.onrender.com/api"
$EMAIL    = "natalieibiam@gmail.com"
$PASSWORD = "INTERCORe1237#"

$headers = @{ "Content-Type" = "application/json" }

function Pass($msg) { Write-Host "  PASS: $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  FAIL: $msg" -ForegroundColor Red }
function Info($msg) { Write-Host "  INFO: $msg" -ForegroundColor Yellow }
function Warn($msg) { Write-Host "  WARN: $msg" -ForegroundColor Magenta }
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
} catch {
    Fail "Login failed: $($_.Exception.Message)"
    exit
}

$auth = @{
    "Content-Type"  = "application/json"
    "Authorization" = "Bearer $token"
}

# STEP 2: Check status
Section "STEP 2 - Current Security Status"

$twoStepEnabled = $false
try {
    $status = Invoke-RestMethod -Uri "$BASE/two-step/status" -Method GET -Headers $auth
    $twoStepEnabled = $status.twoStepEnabled
    Pass "Status fetched"
    Info "twoStepEnabled : $($status.twoStepEnabled)"
    Info "passkeyEnabled : $($status.passkeyEnabled)"
} catch {
    Fail "Status fetch failed: $($_.Exception.Message)"
}

# STEP 3: Handle two-step state
# If already enabled from last test run, disable first then re-enable cleanly
Section "STEP 3 - Two-Step Setup"

$testPin = "246810"

if ($twoStepEnabled -eq $true) {
    Warn "Two-step is already ON from a previous test run"
    Info "Attempting to disable with common test PINs..."

    $pinsToTry = @("123456", "654321", "246810")
    $disabled  = $false

    foreach ($tryPin in $pinsToTry) {
        try {
            $body = '{"pin":"' + $tryPin + '"}'
            Invoke-RestMethod -Uri "$BASE/two-step/disable" -Method POST -Headers $auth -Body $body | Out-Null
            Pass "Disabled with PIN: $tryPin"
            $disabled       = $true
            $twoStepEnabled = $false
            break
        } catch {
            Info "PIN $tryPin did not work, trying next..."
        }
    }

    if (-not $disabled) {
        Warn "Could not disable with test PINs - will test emails on existing enabled account"
        Warn "Go to Security screen in app and disable two-step manually, then re-run this script"
    }
}

# Now enable fresh with our known test PIN
if ($twoStepEnabled -eq $false) {
    try {
        $body = '{"pin":"' + $testPin + '","hint":"even numbers"}'
        $res  = Invoke-RestMethod -Uri "$BASE/two-step/enable" -Method POST -Headers $auth -Body $body
        Pass "Two-step enabled with PIN: $testPin"
        Info "Recovery code: $($res.recoveryCode)"
        Info "EMAIL SENT: Two-step verification ENABLED"
        $twoStepEnabled = $true
    } catch {
        Fail "Enable failed: $($_.Exception.Message)"
    }
}

# STEP 4: Change PIN
Section "STEP 4 - Change PIN"

$newPin  = "135790"
$pinBack = $testPin

if ($twoStepEnabled -eq $true) {
    try {
        $body = '{"currentPin":"' + $testPin + '","newPin":"' + $newPin + '"}'
        $res  = Invoke-RestMethod -Uri "$BASE/two-step/change-pin" -Method POST -Headers $auth -Body $body
        Pass "PIN changed to: $newPin"
        Info "EMAIL SENT: PIN changed"

        Start-Sleep -Seconds 1

        $body2 = '{"currentPin":"' + $newPin + '","newPin":"' + $pinBack + '"}'
        Invoke-RestMethod -Uri "$BASE/two-step/change-pin" -Method POST -Headers $auth -Body $body2 | Out-Null
        Pass "PIN restored to: $pinBack"
        Info "EMAIL SENT: PIN changed again"
    } catch {
        Fail "Change PIN failed: $($_.Exception.Message)"
    }
} else {
    Info "Skipping - two-step not enabled"
}

# STEP 5: Disable two-step
Section "STEP 5 - Disable Two-Step"

if ($twoStepEnabled -eq $true) {
    try {
        $body = '{"pin":"' + $testPin + '"}'
        $res  = Invoke-RestMethod -Uri "$BASE/two-step/disable" -Method POST -Headers $auth -Body $body
        Pass "Two-step disabled"
        Info "EMAIL SENT: Two-step verification DISABLED"
        $twoStepEnabled = $false
    } catch {
        Fail "Disable failed: $($_.Exception.Message)"
        Info "This is unexpected - the PIN should be $testPin"
    }
} else {
    Info "Skipping - two-step not enabled"
}

# STEP 6: Debug passkey controller first
Section "STEP 6 - Check Passkey Controller Health"

try {
    $opts = Invoke-RestMethod -Uri "$BASE/passkey/register/options" -Method GET -Headers $auth
    Pass "Passkey register/options endpoint OK"
    Info "rpId: $($opts.rp.id)"
} catch {
    Fail "Passkey register/options failed: $($_.Exception.Message)"
    Warn "This means passkeyController.js has a require error"
    Warn "Check Render logs for: Cannot find module or sendPasskeyRegisteredEmail is not a function"
}

# STEP 7: Register test passkey
Section "STEP 7 - Register Test Passkey"

$passkeyId = $null

try {
    $body = '{"fallback":true,"deviceName":"PowerShell Test Device","deviceId":"ps-test-002"}'
    $res  = Invoke-RestMethod -Uri "$BASE/passkey/register/verify" -Method POST -Headers $auth -Body $body
    Pass "Test passkey registered"
    Info "Passkey ID  : $($res.passkeyId)"
    Info "Device name : $($res.deviceName)"
    Info "Tier        : $($res.tier)"
    Info "EMAIL SENT: New passkey REGISTERED"
    $passkeyId = $res.passkeyId
} catch {
    Fail "Passkey register/verify failed: $($_.Exception.Message)"
    Warn "Check Render logs for the exact error"
    Warn "Most likely cause: sendPasskeyRegisteredEmail not exported from utils/email.js"
    Warn "Make sure you deployed the updated email.js to Render"
}

# STEP 8: Delete test passkey
Section "STEP 8 - Delete Test Passkey"

if ($passkeyId) {
    try {
        $res = Invoke-RestMethod -Uri "$BASE/passkey/$passkeyId" -Method DELETE -Headers $auth
        Pass "Test passkey deleted"
        Info "Remaining passkeys: $($res.remaining)"
        Info "EMAIL SENT: Passkey REMOVED"
    } catch {
        Fail "Passkey delete failed: $($_.Exception.Message)"
    }
} else {
    Info "Skipping - no passkey ID (register step failed)"
}

# STEP 9: Final passkey list check
Section "STEP 9 - Final Passkey List"

try {
    $list = Invoke-RestMethod -Uri "$BASE/passkey/list" -Method GET -Headers $auth
    Pass "Passkey list fetched"
    Info "Registered passkeys: $($list.passkeys.Count)"
    if ($list.passkeys.Count -eq 0) {
        Pass "List is clean"
    } else {
        foreach ($pk in $list.passkeys) {
            Info "  -> $($pk.deviceName) | $($pk.tier) | $($pk.createdAt)"
        }
    }
} catch {
    Fail "Passkey list failed: $($_.Exception.Message)"
}

# STEP 10: Final two-step status check
Section "STEP 10 - Final Status Check"

try {
    $final = Invoke-RestMethod -Uri "$BASE/two-step/status" -Method GET -Headers $auth
    Pass "Final status fetched"
    Info "twoStepEnabled : $($final.twoStepEnabled)"
    Info "passkeyEnabled : $($final.passkeyEnabled)"
    if ($final.twoStepEnabled -eq $false -and $final.passkeyEnabled -eq $false) {
        Pass "Account is back to clean state"
    }
} catch {
    Fail "Final status check failed: $($_.Exception.Message)"
}

# Summary
Section "DONE"
Write-Host ""
Write-Host "Check inbox at: $EMAIL" -ForegroundColor Green
Write-Host ""
Write-Host "Expected emails (A through F):" -ForegroundColor Yellow
Write-Host "  A - Two-step verification ENABLED"
Write-Host "  B - Two-step PIN CHANGED"
Write-Host "  C - Two-step PIN CHANGED (restored)"
Write-Host "  D - Two-step verification DISABLED"
Write-Host "  E - New passkey REGISTERED"
Write-Host "  F - Passkey REMOVED"
Write-Host ""
Write-Host "If step 6 or 7 still fails:" -ForegroundColor Yellow
Write-Host "  Open Render dashboard, go to your backend service"
Write-Host "  Click Logs and look for the error after the 500"
Write-Host "  It will say exactly which function or module is missing"
Write-Host ""