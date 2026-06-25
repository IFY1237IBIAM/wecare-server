# Rate Limiting Test Script
# Run: .\test-rate-limits.ps1
#
# Tests that each rate limiter actually triggers after its configured max.
# This sends real requests rapidly - expect some delay as it runs.

$BASE = "https://wecare-backend-anxl.onrender.com/api"
$headers = @{ "Content-Type" = "application/json" }

function Pass($msg) { Write-Host "  PASS: $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  FAIL: $msg" -ForegroundColor Red }
function Info($msg) { Write-Host "  INFO: $msg" -ForegroundColor Yellow }
function Section($title) {
    Write-Host ""
    Write-Host "--- $title ---" -ForegroundColor Cyan
}

function Test-RateLimit {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Method,
        [string]$Body,
        [hashtable]$Headers,
        [int]$ExpectedMax
    )

    Write-Host ""
    Write-Host "--- $Name (expect block after $ExpectedMax attempts) ---" -ForegroundColor Cyan

    $blockedAt = $null
    for ($i = 1; $i -le ($ExpectedMax + 3); $i++) {
        try {
            if ($Method -eq "GET") {
                Invoke-RestMethod -Uri $Url -Method GET -Headers $Headers -ErrorAction Stop | Out-Null
            } else {
                Invoke-RestMethod -Uri $Url -Method $Method -Headers $Headers -Body $Body -ErrorAction Stop | Out-Null
            }
            Info "Attempt $i : passed through (200/normal response)"
        } catch {
            $statusCode = $_.Exception.Response.StatusCode.value__
            if ($statusCode -eq 429) {
                Info "Attempt $i : BLOCKED (429 Too Many Requests)"
                if (-not $blockedAt) { $blockedAt = $i }
            } else {
                Info "Attempt $i : other response ($statusCode) - expected for wrong credentials"
            }
        }
        Start-Sleep -Milliseconds 200
    }

    if ($blockedAt) {
        Pass "Rate limit triggered at attempt $blockedAt (expected around $ExpectedMax)"
    } else {
        Fail "Rate limit NEVER triggered after $($ExpectedMax + 3) attempts - limiter may not be active"
    }
}

# ── TEST 1: Two-step verify (5 per 15 min) ────────────────────────────────────
Test-RateLimit `
    -Name "TEST 1 - two-step/verify" `
    -Url "$BASE/two-step/verify" `
    -Method "POST" `
    -Body '{"pin":"000000","email":"mom@gmail.com"}' `
    -Headers $headers `
    -ExpectedMax 5

# ── TEST 2: Two-step recover (5 per 15 min) ───────────────────────────────────
Test-RateLimit `
    -Name "TEST 2 - two-step/recover" `
    -Url "$BASE/two-step/recover" `
    -Method "POST" `
    -Body '{"email":"mom@gmail.com","recoveryCode":"AAAAAAAAAA","newPin":"111111"}' `
    -Headers $headers `
    -ExpectedMax 5

# ── TEST 3: Passkey auth options (10 per 15 min) ──────────────────────────────
Test-RateLimit `
    -Name "TEST 3 - passkey/auth/options" `
    -Url "$BASE/passkey/auth/options" `
    -Method "POST" `
    -Body '{"pseudonym":"nonexistentuser12345"}' `
    -Headers $headers `
    -ExpectedMax 10

# ── TEST 4: Account recovery request (5 per hour) ─────────────────────────────
Section "TEST 4 - recovery/request (expect block after 5 - this is slower, 1 hour window)"

$blockedAt = $null
for ($i = 1; $i -le 7; $i++) {
    try {
        $body = @{
            email      = "ratelimittest$i@example.com"
            pseudonym  = "RateLimitTest$i"
            accountAge = "test"
            reason     = "This is a rate limit test submission with enough characters to pass validation."
        } | ConvertTo-Json
        Invoke-RestMethod -Uri "$BASE/recovery/request" -Method POST -Headers $headers -Body $body -ErrorAction Stop | Out-Null
        Info "Attempt $i : passed through"
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 429) {
            Info "Attempt $i : BLOCKED (429 Too Many Requests)"
            if (-not $blockedAt) { $blockedAt = $i }
        } else {
            Info "Attempt $i : other response ($statusCode)"
        }
    }
    Start-Sleep -Milliseconds 300
}

if ($blockedAt) {
    Pass "Rate limit triggered at attempt $blockedAt (expected around 5)"
} else {
    Fail "Rate limit NEVER triggered after 7 attempts - limiter may not be active"
}

# ── TEST 5: Confirm normal login still works (not over-limited) ──────────────
Section "TEST 5 - Confirm Normal Login Still Works"

try {
    $body = '{"email":"mom@gmail.com","password":"INTERCORe1237#"}'
    $res  = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST -Headers $headers -Body $body
    Pass "Normal login still works fine: logged in as $($res.user.pseudonym)"
} catch {
    Fail "Normal login failed: $($_.Exception.Message)"
}

# ── TEST 6: Confirm authenticated endpoints still work for legit use ─────────
Section "TEST 6 - Confirm Authenticated Status Check Still Works"

try {
    $body = '{"email":"mom@gmail.com","password":"INTERCORe1237#"}'
    $res  = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST -Headers $headers -Body $body
    $token = $res.token
    $auth  = @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $token" }
    $status = Invoke-RestMethod -Uri "$BASE/two-step/status" -Method GET -Headers $auth
    Pass "Status check works fine (not over-limited): twoStepEnabled = $($status.twoStepEnabled)"
} catch {
    Fail "Status check failed: $($_.Exception.Message)"
}

# Summary
Section "DONE"
Write-Host ""
Write-Host "Rate limiting test complete." -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT NOTES:" -ForegroundColor Yellow
Write-Host "  - Rate limits are per-IP. Since this script runs from one machine,"
Write-Host "    all requests share the same IP and should trigger limits correctly."
Write-Host "  - The /two-step/verify and /two-step/recover limiters now have a"
Write-Host "    few of your IP's attempts used up - wait 15 minutes before normal"
Write-Host "    testing of those endpoints again, or restart your router/use mobile"
Write-Host "    data to get a different IP if you need to test immediately."
Write-Host "  - The recovery/request limiter has a 1 HOUR window - your IP may be"
Write-Host "    blocked from submitting new recovery requests for up to an hour."
Write-Host "  - This is EXPECTED and CORRECT behavior - it proves the limiters work."
Write-Host ""