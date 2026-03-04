# Script to create inventory history database indexes
# Run this once after deploying the history system

Write-Host "Creating inventory history database indexes..." -ForegroundColor Cyan

# Get the base URL from environment or use localhost
$BaseUrl = if ($env:APP_URL) { $env:APP_URL } else { "http://localhost:5173" }
$IndexEndpoint = "$BaseUrl/api/inventory/indexes"

Write-Host "Endpoint: $IndexEndpoint" -ForegroundColor Yellow

# You need to be authenticated as a superadmin
# Option 1: Use a valid session cookie after logging in through the browser
# Option 2: Manually set cookie here (replace with your actual session cookie)

Write-Host ""
Write-Host "IMPORTANT: You must be logged in as a superadmin in your browser first!" -ForegroundColor Red
Write-Host "1. Open $BaseUrl in your browser" -ForegroundColor Yellow
Write-Host "2. Login with superadmin credentials" -ForegroundColor Yellow
Write-Host "3. Then run this script to create indexes using your session" -ForegroundColor Yellow
Write-Host ""

# Try to create indexes
try {
    $response = Invoke-WebRequest `
        -Uri $IndexEndpoint `
        -Method POST `
        -UseBasicParsing `
        -SessionVariable session `
        -ErrorAction Stop
    
    $result = $response.Content | ConvertFrom-Json
    
    if ($result.success) {
        Write-Host "✓ Indexes created successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Created indexes:" -ForegroundColor Cyan
        $result.indexes.history | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
        $result.indexes.deleted | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
    } else {
        Write-Host "✗ Failed to create indexes" -ForegroundColor Red
        Write-Host $result.error -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Error calling API endpoint" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Possible issues:" -ForegroundColor Yellow
    Write-Host "  - Application not running on $BaseUrl" -ForegroundColor Gray
    Write-Host "  - Not logged in as superadmin" -ForegroundColor Gray
    Write-Host "  - CORS or cookie issues" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Alternative method:" -ForegroundColor Yellow
Write-Host "Use a REST client (Postman, Insomnia, etc.) to POST to:" -ForegroundColor Gray
Write-Host "  $IndexEndpoint" -ForegroundColor Gray
Write-Host "Include your authentication cookie in the request." -ForegroundColor Gray
