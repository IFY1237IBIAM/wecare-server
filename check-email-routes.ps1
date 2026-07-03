# Probe email routes to discover what exists and whether rate limiting is on
# Run: .\check-email-routes.ps1

$BASE = "https://wecare-backend-anxl.onrender.com/api"
$headers = @{ "Content-Type" = "application/json" }

function Info($msg)    { Write-Host "  INFO: $msg" -ForegroundColor Yellow }
function Found($msg)   { Write-Host "  EXISTS: $msg" -ForegroundColor Green }
function Missing($msg) { Write-Host "  404: $msg" -ForegroundColor Gray }
function Section($t)   { Write-Host ""; Write-Host "--- $t ---" -ForegroundColor Cyan }

function Test-Route($method, $path, $body) {
    try {
        if ($method -eq "GET") {
            $res = Invoke-RestMethod -Uri "$BASE$path" -Method GET -Headers $headers -ErrorAction Stop
        } else {
            $res = Invoke-RestMethod -Uri "$BASE$path" -Method POST -Headers $headers -Body $body -ErrorAction Stop
        }
        Found "$method $path -> 200/success"
        return $true
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        if ($code -eq 404) {
            Missing "$method $path -> 404 (route does not exist)"
        } else {
            Found "$method $path -> $code (route EXISTS, returned $code)"
        }
        return ($code -ne 404)
    }
}

Section "Probing email routes to see which ones exist"

$fakeEmail = '{"email":"probe-test-xyz@example.com"}'
$fakeCode  = '{"email":"probe-test-xyz@example.com","code":"000000"}'
$fakeToken = '{"token":"fake-token-xyz"}'

# Common forgot-password route names
Test-Route "POST" "/email/forgot-password"     $fakeEmail
Test-Route "POST" "/email/send-reset-code"     $fakeEmail
Test-Route "POST" "/email/request-reset"       $fakeEmail
Test-Route "POST" "/email/reset-password"      $fakeCode
Test-Route "POST" "/email/verify-reset-code"   $fakeCode
Test-Route "POST" "/email/change-password"     $fakeCode

# Email verification routes
Test-Route "POST" "/email/verify-email"        $fakeToken
Test-Route "POST" "/email/verify"              $fakeToken
Test-Route "POST" "/email/confirm"             $fakeToken
Test-Route "POST" "/email/resend-verification" $fakeEmail
Test-Route "POST" "/email/resend"              $fakeEmail

# Check rate limiting on any route that exists by hitting it rapidly
Section "Checking rate limiting on found routes"
Info "Any route returning non-404 above - hit it 10 times rapidly to check for 429"

$routesToCheck = @(
    @{ method="POST"; path="/email/forgot-password";     body=$fakeEmail },
    @{ method="POST"; path="/email/send-reset-code";     body=$fakeEmail },
    @{ method="POST"; path="/email/reset-password";      body=$fakeCode  },
    @{ method="POST"; path="/email/verify-email";        body=$fakeToken },
    @{ method="POST"; path="/email/resend-verification"; body=$fakeEmail }
)

foreach ($route in $routesToCheck) {
    $got429 = $false
    $lastCode = 0
    for ($i = 1; $i -le 10; $i++) {
        try {
            Invoke-RestMethod -Uri "$BASE$($route.path)" -Method $route.method -Headers $headers -Body $route.body -ErrorAction Stop | Out-Null
        } catch {
            $code = $_.Exception.Response.StatusCode.value__
            $lastCode = $code
            if ($code -eq 429) { $got429 = $true; break }
            if ($code -eq 404) { break }
        }
    }
    if ($lastCode -eq 404) { continue }   # skip non-existent routes
    if ($got429) {
        Write-Host "  RATE LIMITED: $($route.path)" -ForegroundColor Green
    } else {
        Write-Host "  NOT RATE LIMITED: $($route.path) (sent 10 requests, no 429)" -ForegroundColor Red
    }
}

Write-Host ""