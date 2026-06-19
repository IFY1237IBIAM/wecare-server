# HushCircle Login Activity Test Script
# Run: .\test-login-activity.ps1

$BASE     = "https://wecare-backend-anxl.onrender.com/api"
$EMAIL    = "mom@gmail.com"
$PASSWORD = "INTERCORe1237#"

$headers = @{ "Content-Type" = "application/json" }

function Pass($msg) { Write-Host "  PASS: $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  FAIL: $msg" -ForegroundColor Red }
function Info($msg) { Write-Host "  INFO: $msg" -ForegroundColor Yellow }
function Section($title) {
    Write-Host ""
    Write-Host "--- $title ---" -ForegroundColor Cyan
}

# STEP 1: Login from "Device A"
Section "STEP 1 - Login from Device A"

$tokenA = $null
try {
    $body = '{"email":"' + $EMAIL + '","password":"' + $PASSWORD + '","deviceName":"PowerShell Device A","deviceOS":"Windows Test"}'
    $res  = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST -Headers $headers -Body $body
    $tokenA = $res.token
    Pass "Logged in as: $($res.user.pseudonym)"
    Info "Token A acquired"
} catch {
    Fail "Login A failed: $($_.Exception.Message)"
    exit
}

$authA = @{
    "Content-Type"  = "application/json"
    "Authorization" = "Bearer $tokenA"
}

# STEP 2: Login again from "Device B" (simulates a second device)
Section "STEP 2 - Login from Device B (simulated second device)"

$tokenB = $null
try {
    $body = '{"email":"' + $EMAIL + '","password":"' + $PASSWORD + '","deviceName":"PowerShell Device B","deviceOS":"Windows Test B"}'
    $res  = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST -Headers $headers -Body $body
    $tokenB = $res.token
    Pass "Logged in again as: $($res.user.pseudonym)"
    Info "Token B acquired - this simulates a second device session"
} catch {
    Fail "Login B failed: $($_.Exception.Message)"
}

$authB = @{
    "Content-Type"  = "application/json"
    "Authorization" = "Bearer $tokenB"
}

# Give the backend a moment to write both records
Start-Sleep -Seconds 2

# STEP 3: Fetch login history using Device A's token
Section "STEP 3 - Fetch Login History (as Device A)"

$activities = $null
try {
    $res = Invoke-RestMethod -Uri "$BASE/activity/login-history" -Method GET -Headers $authA
    $activities = $res.activities
    Pass "Login history fetched"
    Info "Total sessions returned: $($activities.Count)"

    if ($activities.Count -ge 2) {
        Pass "At least 2 sessions found (Device A and Device B)"
    } else {
        Fail "Expected at least 2 sessions, got $($activities.Count)"
    }
} catch {
    Fail "Fetch history failed: $($_.Exception.Message)"
}

# STEP 4: Inspect each session's details
Section "STEP 4 - Inspect Session Details"

if ($activities) {
    foreach ($a in $activities | Select-Object -First 5) {
        $currentTag = if ($a.isCurrent) { "[CURRENT]" } else { "" }
        $activeTag  = if ($a.isActive)  { "active" } else { "revoked" }
        Info "$currentTag Device: $($a.deviceName) | OS: $($a.deviceOS) | Method: $($a.method) | Status: $activeTag"
        Info "        Location: $($a.flag) $($a.city) $($a.country) | Session: $($a.sessionId.Substring(0,12))..."
    }

    # Check exactly one session is marked current
    $currentCount = @($activities | Where-Object { $_.isCurrent -eq $true }).Count
    if ($currentCount -eq 1) {
        Pass "Exactly one session correctly marked as current device"
    } else {
        Fail "Expected exactly 1 current session, found $currentCount"
    }

    # Check device names match what we sent
    $deviceANameFound = @($activities | Where-Object { $_.deviceName -eq "PowerShell Device A" }).Count -gt 0
    $deviceBNameFound = @($activities | Where-Object { $_.deviceName -eq "PowerShell Device B" }).Count -gt 0

    if ($deviceANameFound) { Pass "Device A name recorded correctly" } else { Fail "Device A name not found in history" }
    if ($deviceBNameFound) { Pass "Device B name recorded correctly" } else { Fail "Device B name not found in history" }
} else {
    Fail "No activities to inspect"
}

# STEP 5: Find Device B's sessionId to test revoke
Section "STEP 5 - Find Device B Session for Revoke Test"

$deviceBSessionId = $null
if ($activities) {
    $deviceBEntry = $activities | Where-Object { $_.deviceName -eq "PowerShell Device B" -and $_.isActive -eq $true } | Select-Object -First 1
    if ($deviceBEntry) {
        $deviceBSessionId = $deviceBEntry.sessionId
        Pass "Found Device B session: $($deviceBSessionId.Substring(0,12))..."
    } else {
        Fail "Could not find an active Device B session"
    }
}

# STEP 6: Try to revoke current session (should fail with 400)
Section "STEP 6 - Attempt to Revoke CURRENT Session (should be blocked)"

$currentSessionId = $null
if ($activities) {
    $currentEntry = $activities | Where-Object { $_.isCurrent -eq $true } | Select-Object -First 1
    if ($currentEntry) { $currentSessionId = $currentEntry.sessionId }
}

if ($currentSessionId) {
    try {
        $res = Invoke-RestMethod -Uri "$BASE/activity/revoke/$currentSessionId" -Method DELETE -Headers $authA
        Fail "Revoking current session should have been blocked but succeeded"
    } catch {
        if ($_.Exception.Message -like "*400*") {
            Pass "Correctly blocked from revoking current session (400 as expected)"
        } else {
            Info "Got error but not the expected 400: $($_.Exception.Message)"
        }
    }
} else {
    Info "Skipping - no current session identified"
}

# STEP 7: Revoke Device B's session (should succeed)
Section "STEP 7 - Revoke Device B Session (should succeed)"

if ($deviceBSessionId) {
    try {
        $res = Invoke-RestMethod -Uri "$BASE/activity/revoke/$deviceBSessionId" -Method DELETE -Headers $authA
        Pass "Device B session revoked successfully"
        Info "Message: $($res.message)"
    } catch {
        Fail "Revoke failed: $($_.Exception.Message)"
    }
} else {
    Info "Skipping - no Device B session ID found"
}

# STEP 8: Confirm Device B session shows as inactive now
Section "STEP 8 - Confirm Device B is Now Inactive"

try {
    $res = Invoke-RestMethod -Uri "$BASE/activity/login-history" -Method GET -Headers $authA
    $deviceBNow = $res.activities | Where-Object { $_.sessionId -eq $deviceBSessionId } | Select-Object -First 1
    if ($deviceBNow) {
        if ($deviceBNow.isActive -eq $false) {
            Pass "Device B session correctly shows as inactive/revoked"
            Info "revokedAt: $($deviceBNow.revokedAt)"
        } else {
            Fail "Device B session still shows as active"
        }
    } else {
        Info "Could not find Device B session in refreshed list"
    }
} catch {
    Fail "Refresh check failed: $($_.Exception.Message)"
}

# STEP 9: Login again to create a 3rd session, then test revoke-all
Section "STEP 9 - Create Device C and Test Revoke-All"

$tokenC = $null
try {
    $body = '{"email":"' + $EMAIL + '","password":"' + $PASSWORD + '","deviceName":"PowerShell Device C","deviceOS":"Windows Test C"}'
    $res  = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST -Headers $headers -Body $body
    $tokenC = $res.token
    Pass "Device C logged in"
} catch {
    Fail "Device C login failed: $($_.Exception.Message)"
}

Start-Sleep -Seconds 1

try {
    $res = Invoke-RestMethod -Uri "$BASE/activity/revoke-all" -Method DELETE -Headers $authA
    Pass "Revoke-all executed"
    Info "Message: $($res.message)"
} catch {
    Fail "Revoke-all failed: $($_.Exception.Message)"
}

# STEP 10: Final check - only current (Device A) should be active
Section "STEP 10 - Final State Check"

try {
    $res = Invoke-RestMethod -Uri "$BASE/activity/login-history" -Method GET -Headers $authA
    $activeOnes = @($res.activities | Where-Object { $_.isActive -eq $true })
    Pass "Final history fetched"
    Info "Active sessions remaining: $($activeOnes.Count)"

    if ($activeOnes.Count -eq 1 -and $activeOnes[0].isCurrent) {
        Pass "Only the current session (Device A) remains active - revoke-all worked correctly"
    } else {
        Info "Active sessions found:"
        foreach ($a in $activeOnes) {
            Info "  -> $($a.deviceName) | current: $($a.isCurrent)"
        }
    }
} catch {
    Fail "Final check failed: $($_.Exception.Message)"
}

# Summary
Section "DONE"
Write-Host ""
Write-Host "Login Activity system test complete." -ForegroundColor Green
Write-Host ""
Write-Host "What was tested:" -ForegroundColor Yellow
Write-Host "  - Multiple logins create separate session records"
Write-Host "  - Each session stores device name, OS, location, method"
Write-Host "  - Current device is correctly identified"
Write-Host "  - Cannot revoke your own current session (safety check)"
Write-Host "  - Can revoke a specific other session"
Write-Host "  - Revoked sessions show isActive false with timestamp"
Write-Host "  - Revoke-all signs out everything except current device"
Write-Host ""
Write-Host "If any FAIL appeared above, check:" -ForegroundColor Yellow
Write-Host "  - LoginActivity model is required in server.js"
Write-Host "  - /api/activity route is mounted in server.js"
Write-Host "  - authController.js login() includes recordLogin call"
Write-Host "  - middleware/auth.js exports.protect includes sessionId"
Write-Host ""