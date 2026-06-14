# HushCircle Security Test Script
# Run: .\test-security.ps1

$BASE     = "https://wecare-backend-anxl.onrender.com/api"
$EMAIL    = "mom@gmail.com"
$PASSWORD = "INTERCORe1237+"

$headers = @{ "Content-Type" = "application/json" }

function Pass($msg) { Write-Host "  PASS: $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  FAIL: $msg" -ForegroundColor Red }
function Info($msg) { Write-Host "  INFO: $msg" -ForegroundColor Yellow }
function Section($title) {
    Write-Host ""
    Write-Host "--- $title ---" -ForegroundColor Cyan
}

# TEST 1: Well-known files
Section "TEST 1 - apple-app-site-association"
try {
    $aasa = Invoke-RestMethod -Uri "https://wecare-backend-anxl.onrender.com/.well-known/apple-app-site-association" -Method GET
    if ($aasa.webcredentials) {
        Pass "File is live and has webcredentials key"
        Info "Apps: $($aasa.webcredentials.apps)"
    } else {
        Fail "File returned but missing webcredentials key"
    }
} catch {
    Fail "Not reachable: $($_.Exception.Message)"
}

Section "TEST 1b - assetlinks.json"
try {
    $al = Invoke-RestMethod -Uri "https://wecare-backend-anxl.onrender.com/.well-known/assetlinks.json" -Method GET
    if ($al) {
        Pass "File is live"
        Info "Package: $($al[0].target.package_name)"
    } else {
        Fail "Empty response"
    }
} catch {
    Fail "Not reachable: $($_.Exception.Message)"
}

# TEST 2: Login
Section "TEST 2 - Login"
$token = $null
$pseudonym = $null
try {
    $body = '{"email":"' + $EMAIL + '","password":"' + $PASSWORD + '"}'
    $res  = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST -Headers $headers -Body $body
    $token     = $res.token
    $pseudonym = $res.user.pseudonym
    Pass "Login successful"
    Info "Pseudonym : $pseudonym"
    Info "Role      : $($res.user.role)"
    Info "Token     : $($token.Substring(0,40))..."
    if ($res.twoStep -eq $true) {
        Info "Two-step  : ENABLED - PIN would be required"
    } else {
        Info "Two-step  : not enabled yet"
    }
} catch {
    Fail "Login failed: $($_.Exception.Message)"
    Write-Host "Check your email and password in the script." -ForegroundColor Red
    exit
}

$authHeaders = @{
    "Content-Type"  = "application/json"
    "Authorization" = "Bearer $token"
}

# TEST 3: Two-step status
Section "TEST 3 - Two-Step Status"
try {
    $ts = Invoke-RestMethod -Uri "$BASE/two-step/status" -Method GET -Headers $authHeaders
    Pass "Endpoint reachable"
    Info "twoStepEnabled : $($ts.twoStepEnabled)"
    Info "recoveryUsed   : $($ts.recoveryUsed)"
    Info "passkeyEnabled : $($ts.passkeyEnabled)"
} catch {
    Fail "Failed: $($_.Exception.Message)"
}

# TEST 4: Passkey list
Section "TEST 4 - Passkey List"
try {
    $pklist = Invoke-RestMethod -Uri "$BASE/passkey/list" -Method GET -Headers $authHeaders
    Pass "Endpoint reachable"
    $count = $pklist.passkeys.Count
    Info "Registered passkeys: $count"
    if ($count -gt 0) {
        foreach ($pk in $pklist.passkeys) {
            Info "  -> $($pk.deviceName) | tier: $($pk.tier) | created: $($pk.createdAt)"
        }
    } else {
        Info "No passkeys yet - register one in the app Security screen"
    }
} catch {
    Fail "Failed: $($_.Exception.Message)"
}

# TEST 5: Passkey registration options
Section "TEST 5 - Passkey Registration Options"
try {
    $opts = Invoke-RestMethod -Uri "$BASE/passkey/register/options" -Method GET -Headers $authHeaders
    Pass "Endpoint reachable"
    Info "rpId      : $($opts.rp.id)"
    Info "rpName    : $($opts.rp.name)"
    Info "challenge : $($opts.challenge.Substring(0,20))..."
    if ($opts.rp.id -eq "wecare-backend-anxl.onrender.com") {
        Pass "RP ID is correct"
    } else {
        Fail "RP ID mismatch - set PASSKEY_RP_ID env var on Render"
        Info "Expected: wecare-backend-anxl.onrender.com"
        Info "Got     : $($opts.rp.id)"
    }
} catch {
    Fail "Failed: $($_.Exception.Message)"
}

# TEST 6: Passkey auth options
Section "TEST 6 - Passkey Auth Options"
try {
    $abody = '{"pseudonym":"' + $pseudonym + '"}'
    $aopts = Invoke-RestMethod -Uri "$BASE/passkey/auth/options" -Method POST -Headers $headers -Body $abody
    if ($aopts.fallbackOnly -eq $true) {
        Pass "Endpoint reachable"
        Info "Mode: biometric fallback (no WebAuthn passkey registered yet)"
    } elseif ($aopts.challenge) {
        Pass "Endpoint reachable"
        Info "challenge        : $($aopts.challenge.Substring(0,20))..."
        Info "allowCredentials : $($aopts.allowCredentials.Count) credential(s)"
    }
} catch {
    $msg = $_.Exception.Message
    if ($msg -like "*404*" -or $msg -like "*No passkey*") {
        Info "No passkey registered yet - expected on first run"
    } else {
        Fail "Failed: $msg"
    }
}

# TEST 7: Health
Section "TEST 7 - Server Health"
try {
    $health = Invoke-RestMethod -Uri "$BASE/health" -Method GET
    Pass "Server is healthy"
    Info "Uptime: $([math]::Round($health.uptime / 60, 1)) minutes"
} catch {
    Fail "Health check failed: $($_.Exception.Message)"
}

# SUMMARY
Write-Host ""
Write-Host "--- DONE ---" -ForegroundColor Cyan
Write-Host "All PASS = backend is ready. Build the app and test passkey on device." -ForegroundColor Green
Write-Host ""
Write-Host "Common fixes:" -ForegroundColor Yellow
Write-Host "  FAIL well-known  -> check wellKnownRoutes.js is mounted first in server.js"
Write-Host "  FAIL RP ID       -> set PASSKEY_RP_ID=wecare-backend-anxl.onrender.com on Render"
Write-Host "  FAIL passkey list -> copy Passkey.model.js and passkeyController.js to backend"
Write-Host "  FAIL two-step    -> copy twoStepController.js and twoStepRoutes.js to backend"
Write-Host ""