# Clean enable -> disable cycle test on a fresh account
# Run: .\test-enable-disable-cycle.ps1

$BASE     = "https://wecare-backend-anxl.onrender.com/api"
$EMAIL    = "test@example.com"
$PASSWORD = "Test@1234"
$TESTPIN  = "555444"

$headers = @{ "Content-Type" = "application/json" }

function Pass($msg) { Write-Host "  PASS: $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  FAIL: $msg" -ForegroundColor Red }
function Info($msg) { Write-Host "  INFO: $msg" -ForegroundColor Yellow }
function Section($title) {
    Write-Host ""
    Write-Host "--- $title ---" -ForegroundColor Cyan
}

Section "Login"
$body  = '{"email":"' + $EMAIL + '","password":"' + $PASSWORD + '"}'
$res   = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST -Headers $headers -Body $body
$token = $res.token
Pass "Logged in as $($res.user.pseudonym)"

$auth = @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $token" }

Section "Check starting status"
$status0 = Invoke-RestMethod -Uri "$BASE/two-step/status" -Method GET -Headers $auth
Info "twoStepEnabled = $($status0.twoStepEnabled)"

if ($status0.twoStepEnabled -eq $true) {
    Fail "Account already has two-step ON. Disable it manually first, then re-run this script."
    exit
}

Section "STEP 1 - Enable two-step with PIN $TESTPIN"
try {
    $body1 = '{"pin":"' + $TESTPIN + '","hint":"test"}'
    $res1  = Invoke-RestMethod -Uri "$BASE/two-step/enable" -Method POST -Headers $auth -Body $body1
    Pass "Enabled successfully"
    Info "Recovery code: $($res1.recoveryCode)"
} catch {
    Fail "Enable failed: $($_.Exception.Message)"
    exit
}

Section "STEP 2 - Verify status now shows enabled"
$status1 = Invoke-RestMethod -Uri "$BASE/two-step/status" -Method GET -Headers $auth
Info "twoStepEnabled = $($status1.twoStepEnabled)"
if ($status1.twoStepEnabled -eq $true) {
    Pass "Status correctly shows enabled"
} else {
    Fail "Status still shows disabled after enabling - this would be the bug"
}

Section "STEP 3 - Disable with the same PIN"
try {
    $body2 = '{"pin":"' + $TESTPIN + '"}'
    $res2  = Invoke-RestMethod -Uri "$BASE/two-step/disable" -Method POST -Headers $auth -Body $body2
    Pass "Disabled successfully: $($res2.message)"
} catch {
    $stream  = $_.Exception.Response.GetResponseStream()
    $reader  = New-Object System.IO.StreamReader($stream)
    $errBody = $reader.ReadToEnd()
    Fail "Disable failed: $errBody"
}

Section "STEP 4 - Confirm final status is OFF"
$status2 = Invoke-RestMethod -Uri "$BASE/two-step/status" -Method GET -Headers $auth
Info "twoStepEnabled = $($status2.twoStepEnabled)"
if ($status2.twoStepEnabled -eq $false) {
    Pass "Confirmed - two-step is OFF after disable. Full cycle worked perfectly."
} else {
    Fail "Status still shows enabled after disable - something is wrong"
}

Write-Host ""