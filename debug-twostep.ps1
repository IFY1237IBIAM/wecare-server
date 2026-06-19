# Debug script v2 - properly captures HTTP error response body
$BASE     = "https://wecare-backend-anxl.onrender.com/api"
$EMAIL    = "ibbcodezone@gmail.com"
$PASSWORD = "INTERCORe1237#"

$headers = @{ "Content-Type" = "application/json" }

function Pass($msg) { Write-Host "  PASS: $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  FAIL: $msg" -ForegroundColor Red }
function Info($msg) { Write-Host "  INFO: $msg" -ForegroundColor Yellow }
function Section($title) {
    Write-Host ""
    Write-Host "--- $title ---" -ForegroundColor Cyan
}

function Get-ErrorBody($exception) {
    try {
        $stream = $exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body   = $reader.ReadToEnd()
        return $body
    } catch {
        return "(could not read error body)"
    }
}

Section "Login"
$body = '{"email":"' + $EMAIL + '","password":"' + $PASSWORD + '"}'
$res  = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST -Headers $headers -Body $body
$token = $res.token
Pass "Logged in"

$auth = @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $token" }

Section "Check status BEFORE anything"
$status1 = Invoke-RestMethod -Uri "$BASE/two-step/status" -Method GET -Headers $auth
Info "twoStepEnabled = $($status1.twoStepEnabled)"

Write-Host ""
$testPin = Read-Host "Enter the PIN you set for this account in the app"

Section "Calling disable with that exact PIN"
try {
    $body2 = '{"pin":"' + $testPin + '"}'
    $res2  = Invoke-RestMethod -Uri "$BASE/two-step/disable" -Method POST -Headers $auth -Body $body2
    Pass "Disable succeeded: $($res2.message)"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $errBody    = Get-ErrorBody $_.Exception
    Fail "Disable failed with HTTP $statusCode"
    Info "Raw error body: $errBody"

    if ($errBody -like "*Incorrect PIN*") {
        Info ""
        Info "============================================"
        Info "DIAGNOSIS: The PIN you entered is WRONG."
        Info "This is NOT the 'not enabled' bug from before."
        Info "Double check the exact PIN you set when you"
        Info "enabled two-step in the app."
        Info "============================================"
    } elseif ($errBody -like "*not enabled*") {
        Info ""
        Info "============================================"
        Info "DIAGNOSIS: Backend genuinely thinks two-step"
        Info "is disabled. This contradicts the status check"
        Info "above which showed it as enabled."
        Info "============================================"
    }
}

Write-Host ""