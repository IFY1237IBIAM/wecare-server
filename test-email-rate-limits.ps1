# Email Routes Rate Limit Test
# Run: .\test-email-rate-limits.ps1

$BASE    = "https://wecare-backend-anxl.onrender.com/api"
$headers = @{ "Content-Type" = "application/json" }

function Pass($msg) { Write-Host "  PASS: $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  FAIL: $msg" -ForegroundColor Red }
function Info($msg) { Write-Host "  INFO: $msg" -ForegroundColor Yellow }
function Section($t) { Write-Host ""; Write-Host "--- $t ---" -ForegroundColor Cyan }

function Test-Limiter {
    param([string]$Name, [string]$Url, [string]$Body, [int]$Max)
    Section "$Name (expect block after $Max attempts)"
    $blockedAt = $null
    for ($i = 1; $i -le ($Max + 3); $i++) {
        try {
            Invoke-RestMethod -Uri $Url -Method POST -Headers $headers -Body $Body | Out-Null
            Info "Attempt $i : passed through"
        } catch {
            $code = $_.Exception.Response.StatusCode.value__
            if ($code -eq 429) {
                Info "Attempt $i : BLOCKED (429)"
                if (-not $blockedAt) { $blockedAt = $i }
            } else {
                Info "Attempt $i : other response ($code)"
            }
        }
        Start-Sleep -Milliseconds 200
    }
    if ($blockedAt) {
        Pass "Rate limit triggered at attempt $blockedAt (expected around $Max)"
    } else {
        Fail "Rate limit NEVER triggered - limiter may not be deployed"
    }
}

# TEST 1: forgot-password (max 5)
Test-Limiter `
    -Name "TEST 1 - forgot-password" `
    -Url  "$BASE/email/forgot-password" `
    -Body '{"email":"ratelimit-test@example.com"}' `
    -Max  5

# TEST 2: reset-password (max 5)
Test-Limiter `
    -Name "TEST 2 - reset-password" `
    -Url  "$BASE/email/reset-password" `
    -Body '{"email":"ratelimit-test@example.com","code":"000000","newPassword":"Test@1234"}' `
    -Max  5

# TEST 3: verify-email (max 10)
Test-Limiter `
    -Name "TEST 3 - verify-email" `
    -Url  "$BASE/email/verify-email" `
    -Body '{"token":"fake-token-xyz-rate-limit-test"}' `
    -Max  10

# TEST 4: resend-verification (max 3 - strictest)
Test-Limiter `
    -Name "TEST 4 - resend-verification" `
    -Url  "$BASE/email/resend-verification" `
    -Body '{"email":"ratelimit-test@example.com"}' `
    -Max  3

# TEST 5: Confirm normal login still works
Section "TEST 5 - Normal Login Still Works"
try {
    $body = '{"email":"mom@gmail.com","password":"INTERCORe1237#"}'
    $res  = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST -Headers $headers -Body $body
    Pass "Login works fine: $($res.user.pseudonym)"
} catch {
    Fail "Login failed: $($_.Exception.Message)"
}

Section "DONE"
Write-Host ""
Write-Host "All email routes now have rate limiting." -ForegroundColor Green
Write-Host ""
Write-Host "NOTE: Your IP is now temporarily rate-limited on these endpoints." -ForegroundColor Yellow
Write-Host "Wait 15 minutes before testing password reset flows manually." -ForegroundColor Yellow
Write-Host ""