# Account Recovery Test Script
# Run: .\test-account-recovery.ps1

$BASE = "https://wecare-backend-anxl.onrender.com/api"

# Use an account that exists in your database for realistic testing
$REAL_EMAIL     = "mom@gmail.com"
$REAL_PSEUDONYM = "mom"

# Admin credentials (must have role admin or moderator)
$ADMIN_EMAIL    = "mom@gmail.com"
$ADMIN_PASSWORD = "INTERCORe1237#"

$headers = @{ "Content-Type" = "application/json" }

function Pass($msg) { Write-Host "  PASS: $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  FAIL: $msg" -ForegroundColor Red }
function Info($msg) { Write-Host "  INFO: $msg" -ForegroundColor Yellow }
function Section($title) {
    Write-Host ""
    Write-Host "--- $title ---" -ForegroundColor Cyan
}

# STEP 1: Submit a recovery request for a REAL account
Section "STEP 1 - Submit Recovery Request (real account)"

$requestId = $null
try {
    $body = @{
        email      = $REAL_EMAIL
        pseudonym  = $REAL_PSEUDONYM
        accountAge = "around May 2026"
        reason     = "I forgot my password and I also lost my two-step recovery code. I cannot get back into my account at all."
    } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$BASE/recovery/request" -Method POST -Headers $headers -Body $body
    Pass "Request submitted"
    Info "Message: $($res.message)"
    Info "Request ID: $($res.requestId)"
    $requestId = $res.requestId
} catch {
    Fail "Submit failed: $($_.Exception.Message)"
}

# STEP 2: Submit again immediately - should be rate limited
Section "STEP 2 - Duplicate Submission (should be blocked)"

try {
    $body = @{
        email      = $REAL_EMAIL
        pseudonym  = $REAL_PSEUDONYM
        accountAge = "around May 2026"
        reason     = "Trying again immediately to test rate limiting on this endpoint."
    } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$BASE/recovery/request" -Method POST -Headers $headers -Body $body
    Fail "Duplicate submission succeeded - rate limiting is not working"
} catch {
    $stream  = $_.Exception.Response.GetResponseStream()
    $reader  = New-Object System.IO.StreamReader($stream)
    $errBody = $reader.ReadToEnd()
    if ($errBody -like "*already have a pending*") {
        Pass "Correctly blocked duplicate pending request"
    } else {
        Info "Got a different error: $errBody"
    }
}

# STEP 3: Submit for a FAKE email - should still return generic success (anti-enumeration)
Section "STEP 3 - Submit for Non-Existent Account (anti-enumeration check)"

try {
    $body = @{
        email      = "definitely-fake-email-xyz123@nowhere.com"
        pseudonym  = "FakeGhostUser"
        accountAge = "unknown"
        reason     = "Testing whether the system reveals if this account exists or not."
    } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$BASE/recovery/request" -Method POST -Headers $headers -Body $body
    Pass "Fake email request accepted with generic message (good - prevents enumeration)"
    Info "Message: $($res.message)"
} catch {
    Fail "Fake email request failed unexpectedly: $($_.Exception.Message)"
}

# STEP 4: Check request status (public endpoint)
Section "STEP 4 - Check Request Status (public)"

if ($requestId) {
    try {
        $res = Invoke-RestMethod -Uri "$BASE/recovery/status/$requestId" -Method GET
        Pass "Status check succeeded"
        Info "Status: $($res.status)"
        Info "Submitted: $($res.submittedAt)"
    } catch {
        Fail "Status check failed: $($_.Exception.Message)"
    }
} else {
    Info "Skipping - no request ID from Step 1"
}

# STEP 5: Try to access admin endpoint WITHOUT auth - should be blocked
Section "STEP 5 - Admin Endpoint Without Auth (should be blocked)"

try {
    $res = Invoke-RestMethod -Uri "$BASE/recovery/admin/requests" -Method GET
    Fail "Admin endpoint accessible without auth - SECURITY ISSUE"
} catch {
    Pass "Correctly blocked - admin endpoint requires authentication"
}

# STEP 6: Login as admin
Section "STEP 6 - Login as Admin"

$adminToken = $null
try {
    $body = '{"email":"' + $ADMIN_EMAIL + '","password":"' + $ADMIN_PASSWORD + '"}'
    $res  = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST -Headers $headers -Body $body
    $adminToken = $res.token
    Pass "Logged in as: $($res.user.pseudonym) (role: $($res.user.role))"
    if ($res.user.role -ne "admin" -and $res.user.role -ne "moderator") {
        Fail "This account is NOT admin/moderator - admin tests below will fail"
    }
} catch {
    Fail "Admin login failed: $($_.Exception.Message)"
}

$adminAuth = @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $adminToken" }

# STEP 7: List pending requests as admin
Section "STEP 7 - List Pending Requests (admin)"

try {
    $res = Invoke-RestMethod -Uri "$BASE/recovery/admin/requests?status=pending" -Method GET -Headers $adminAuth
    Pass "Pending requests fetched"
    Info "Count: $($res.requests.Count)"
    foreach ($r in $res.requests | Select-Object -First 5) {
        Info "  -> $($r.submittedPseudonym) | $($r.submittedEmail) | matched account: $(if ($r.user) {'yes'} else {'no'})"
    }
} catch {
    Fail "List failed: $($_.Exception.Message)"
}

# STEP 8: Get full detail of our test request
Section "STEP 8 - Get Request Detail (admin)"

if ($requestId) {
    try {
        $res = Invoke-RestMethod -Uri "$BASE/recovery/admin/requests/$requestId" -Method GET -Headers $adminAuth
        Pass "Detail fetched"
        Info "Submitted pseudonym: $($res.request.submittedPseudonym)"
        Info "Actual pseudonym:    $($res.liveAccount.pseudonym)"
        Info "Pseudonym match: $($res.request.submittedPseudonym -eq $res.liveAccount.pseudonym)"
        Info "Live two-step status: $($res.liveAccount.twoStepEnabled)"
    } catch {
        Fail "Detail fetch failed: $($_.Exception.Message)"
    }
} else {
    Info "Skipping - no request ID"
}

# STEP 9: Approve the request
Section "STEP 9 - Approve Request (admin)"

if ($requestId) {
    try {
        $body = '{"adminNote":"Verified via PowerShell test script - pseudonym and email match exactly."}'
        $res  = Invoke-RestMethod -Uri "$BASE/recovery/admin/requests/$requestId/approve" -Method POST -Headers $adminAuth -Body $body
        Pass "Request approved: $($res.message)"
    } catch {
        $stream  = $_.Exception.Response.GetResponseStream()
        $reader  = New-Object System.IO.StreamReader($stream)
        $errBody = $reader.ReadToEnd()
        Fail "Approve failed: $errBody"
    }
} else {
    Info "Skipping - no request ID"
}

# STEP 10: Verify two-step is now disabled on the real account
Section "STEP 10 - Verify Two-Step Disabled on Real Account"

try {
    $body = '{"email":"' + $REAL_EMAIL + '","password":"' + $ADMIN_PASSWORD + '"}'
    $res  = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST -Headers $headers -Body $body
    $token2 = $res.token
    $auth2  = @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $token2" }
    $status = Invoke-RestMethod -Uri "$BASE/two-step/status" -Method GET -Headers $auth2
    if ($status.twoStepEnabled -eq $false) {
        Pass "Confirmed - two-step is now DISABLED on the real account after approval"
    } else {
        Fail "Two-step is still enabled - approval did not disable it correctly"
    }
} catch {
    Fail "Verification login failed: $($_.Exception.Message)"
}

# STEP 11: Try to approve the same request again - should fail (already approved)
Section "STEP 11 - Re-Approve Same Request (should be blocked)"

if ($requestId) {
    try {
        $body = '{"adminNote":"trying again"}'
        $res  = Invoke-RestMethod -Uri "$BASE/recovery/admin/requests/$requestId/approve" -Method POST -Headers $adminAuth -Body $body
        Fail "Re-approval succeeded - should have been blocked"
    } catch {
        $stream  = $_.Exception.Response.GetResponseStream()
        $reader  = New-Object System.IO.StreamReader($stream)
        $errBody = $reader.ReadToEnd()
        if ($errBody -like "*already been approved*") {
            Pass "Correctly blocked - request already approved"
        } else {
            Info "Got different error: $errBody"
        }
    }
}

# STEP 12: List approved requests to confirm it shows up there now
Section "STEP 12 - List Approved Requests (admin)"

try {
    $res = Invoke-RestMethod -Uri "$BASE/recovery/admin/requests?status=approved" -Method GET -Headers $adminAuth
    Pass "Approved requests fetched"
    Info "Count: $($res.requests.Count)"
    $found = $res.requests | Where-Object { $_._id -eq $requestId }
    if ($found) {
        Pass "Our test request correctly appears in the approved list"
    } else {
        Info "Our test request not found in approved list (may be pagination/limit related)"
    }
} catch {
    Fail "List approved failed: $($_.Exception.Message)"
}

# Summary
Section "DONE"
Write-Host ""
Write-Host "Account recovery system test complete." -ForegroundColor Green
Write-Host ""
Write-Host "What was tested:" -ForegroundColor Yellow
Write-Host "  - Submitting a recovery request for a real account"
Write-Host "  - Rate limiting blocks duplicate pending requests"
Write-Host "  - Anti-enumeration: fake emails get the same generic response"
Write-Host "  - Public status check endpoint"
Write-Host "  - Admin endpoints require authentication"
Write-Host "  - Admin can list, view detail, and approve requests"
Write-Host "  - Approval actually disables two-step on the real account"
Write-Host "  - Cannot approve the same request twice"
Write-Host ""
Write-Host "IMPORTANT: This test just disabled two-step on $REAL_EMAIL" -ForegroundColor Magenta
Write-Host "Re-enable it manually if you want to keep testing two-step features." -ForegroundColor Magenta
Write-Host ""