# Fix stuck two-step PIN using recovery code
# Run: .\fix-twostep.ps1

$BASE          = "https://wecare-backend-anxl.onrender.com/api"
$EMAIL         = "natalieibiam@gmail.com"
$RECOVERY_CODE = "5D57F5D28A"
$NEW_PIN       = "000000"

$headers = @{ "Content-Type" = "application/json" }

function Pass($msg) { Write-Host "  PASS: $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  FAIL: $msg" -ForegroundColor Red }
function Info($msg) { Write-Host "  INFO: $msg" -ForegroundColor Yellow }
function Section($title) {
    Write-Host ""
    Write-Host "--- $title ---" -ForegroundColor Cyan
}

# STEP 1: Reset PIN via recovery code
Section "STEP 1 - Reset PIN via Recovery Code"

try {
    $body = '{"email":"' + $EMAIL + '","recoveryCode":"' + $RECOVERY_CODE + '","newPin":"' + $NEW_PIN + '"}'
    $res  = Invoke-RestMethod -Uri "$BASE/two-step/recover" -Method POST -Headers $headers -Body $body
    Pass "PIN reset successfully via recovery code"
    Info "New PIN is now: $NEW_PIN"
    Info "EMAIL SENT: PIN changed notification"
} catch {
    Fail "Recovery failed: $($_.Exception.Message)"
    Info "Recovery code may have already been used"
    Info "Go to the app Security screen and disable two-step manually"
    exit
}

# STEP 2: Login to get token
Section "STEP 2 - Login"

$token = $null
try {
    $body = '{"email":"mom@gmail.com","password":"INTERCORe1237+"}'
    $res  = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST -Headers $headers -Body $body
    $token = $res.token
    Pass "Logged in as: $($res.user.pseudonym)"
} catch {
    Fail "Login failed: $($_.Exception.Message)"
    exit
}

$auth = @{
    "Content-Type"  = "application/json"
    "Authorization" = "Bearer $token"
}

# STEP 3: Disable two-step with new PIN
Section "STEP 3 - Disable Two-Step with New PIN"

try {
    $body = '{"pin":"' + $NEW_PIN + '"}'
    $res  = Invoke-RestMethod -Uri "$BASE/two-step/disable" -Method POST -Headers $auth -Body $body
    Pass "Two-step disabled"
    Info "EMAIL SENT: Two-step disabled notification"
} catch {
    Fail "Disable failed: $($_.Exception.Message)"
    Info "Try in the app Security screen instead"
}

# STEP 4: Confirm status
Section "STEP 4 - Confirm Clean State"

try {
    $status = Invoke-RestMethod -Uri "$BASE/two-step/status" -Method GET -Headers $auth
    if ($status.twoStepEnabled -eq $false) {
        Pass "Two-step is now OFF - account is clean"
        Info "You can now run test-emails.ps1 again for a full clean run"
    } else {
        Fail "Two-step is still ON - something went wrong"
    }
} catch {
    Fail "Status check failed: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "Done. Now run: .\test-emails.ps1" -ForegroundColor Green
Write-Host ""