# Passkey Cross-Install Detection Test
# Checks whether the deviceId capture and check-device endpoint are working
# Run: .\test-passkey-device-detection.ps1

$BASE = "https://wecare-backend-anxl.onrender.com/api"
$EMAIL    = Read-Host "Enter the email of the account you tested passkey with"
$PASSWORD = Read-Host "Enter the password" -AsSecureString
$PASSWORD_PLAIN = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($PASSWORD))

function Pass($msg) { Write-Host "  PASS: $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  FAIL: $msg" -ForegroundColor Red }
function Info($msg) { Write-Host "  INFO: $msg" -ForegroundColor Yellow }
function Section($t) { Write-Host ""; Write-Host "--- $t ---" -ForegroundColor Cyan }

$headers = @{ "Content-Type" = "application/json" }

# STEP 1: Login
Section "STEP 1 - Login"
try {
    $body = @{ email = $EMAIL; password = $PASSWORD_PLAIN } | ConvertTo-Json
    $res  = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST -Headers $headers -Body $body
    $token = $res.token
    Pass "Logged in as: $($res.user.pseudonym)"
} catch {
    Fail "Login failed: $($_.Exception.Message)"
    exit
}

$auth = @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $token" }

# STEP 2: List passkeys and check deviceId field
Section "STEP 2 - Check existing passkeys for deviceId"
try {
    $listRes = Invoke-RestMethod -Uri "$BASE/passkey/list" -Method GET -Headers $auth
    $passkeys = $listRes.passkeys

    if ($passkeys.Count -eq 0) {
        Info "No passkeys registered for this account."
    } else {
        Info "Found $($passkeys.Count) passkey(s):"
        foreach ($pk in $passkeys) {
            Write-Host ""
            Write-Host "  Device Name : $($pk.deviceName)" -ForegroundColor White
            Write-Host "  Tier        : $($pk.tier)" -ForegroundColor White
            if ($pk.deviceId) {
                Write-Host "  Device ID   : $($pk.deviceId)" -ForegroundColor Green
            } else {
                Write-Host "  Device ID   : NULL OR MISSING" -ForegroundColor Red
            }
            Write-Host "  Created     : $($pk.createdAt)" -ForegroundColor White

            if ($pk.tier -eq "webauthn" -and -not $pk.deviceId) {
                Fail "This WebAuthn passkey has NO deviceId. It was created before the deviceId fix was deployed."
                Info "This is why cross install detection is not working for this passkey."
                Info "FIX: Delete this passkey in the app and create a new one."
            } elseif ($pk.tier -eq "webauthn" -and $pk.deviceId) {
                Pass "This WebAuthn passkey HAS a deviceId saved. Cross install detection should work for it."
            }
        }
    }
} catch {
    Fail "Could not list passkeys: $($_.Exception.Message)"
}

# STEP 3: Test the check-device endpoint directly
Section "STEP 3 - Test check-device endpoint (requires a real deviceId)"
$testDeviceId = Read-Host "Paste a deviceId from Step 2 above to test (or press Enter to skip)"

if ($testDeviceId) {
    try {
        $checkRes = Invoke-RestMethod -Uri "$BASE/passkey/check-device?deviceId=$testDeviceId" -Method GET -Headers $headers
        if ($checkRes.hasPasskey -eq $true) {
            Pass "check-device correctly found a passkey for deviceId: $testDeviceId"
        } else {
            Fail "check-device returned hasPasskey false for a deviceId that should exist"
        }
    } catch {
        Fail "check-device endpoint error: $($_.Exception.Message)"
        Info "Make sure the route is deployed: GET /api/passkey/check-device"
    }
} else {
    Info "Skipped - no deviceId provided"
}

# STEP 4: Test check-device with a fake deviceId (should return false)
Section "STEP 4 - Test check-device with a FAKE deviceId (should return false)"
try {
    $fakeId = "fake-device-id-that-does-not-exist-12345"
    $checkRes2 = Invoke-RestMethod -Uri "$BASE/passkey/check-device?deviceId=$fakeId" -Method GET -Headers $headers
    if ($checkRes2.hasPasskey -eq $false) {
        Pass "Correctly returned false for a non-existent deviceId"
    } else {
        Fail "Returned true for a fake deviceId - something is wrong"
    }
} catch {
    Fail "check-device endpoint error on fake ID test: $($_.Exception.Message)"
}

Section "DONE"
Write-Host ""
Write-Host "SUMMARY:" -ForegroundColor Magenta
Write-Host "If Step 2 showed NULL OR MISSING for your webauthn passkey, that" -ForegroundColor Yellow
Write-Host "confirms the passkey was created before the deviceId fix was deployed." -ForegroundColor Yellow
Write-Host "Delete it in the app and create a fresh one to fix detection." -ForegroundColor Yellow
Write-Host ""