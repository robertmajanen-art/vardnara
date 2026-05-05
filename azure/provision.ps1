# VårdNära — One-time Azure resource provisioning
# Run this script once to create all Azure resources.
# Prerequisites: Azure CLI installed, `az login` completed.
#
# Usage:
#   .\azure\provision.ps1
#   .\azure\provision.ps1 -Location northeurope   # override region

param(
    [string]$Location = "swedencentral",
    [string]$ResourceGroup = "vardnara-rg",
    [string]$PlanName = "vardnara-plan",
    [string]$AppName = "vardnara-api"
)

$ErrorActionPreference = "Stop"

Write-Host "`n==> Creating resource group: $ResourceGroup in $Location" -ForegroundColor Cyan
az group create --name $ResourceGroup --location $Location

Write-Host "`n==> Creating App Service plan: $PlanName (Linux B1)" -ForegroundColor Cyan
az appservice plan create `
    --name $PlanName `
    --resource-group $ResourceGroup `
    --location $Location `
    --is-linux `
    --sku B1

Write-Host "`n==> Creating App Service: $AppName (Node 20)" -ForegroundColor Cyan
az webapp create `
    --name $AppName `
    --resource-group $ResourceGroup `
    --plan $PlanName `
    --runtime "NODE:20-lts"

Write-Host "`n==> Configuring startup command" -ForegroundColor Cyan
az webapp config set `
    --name $AppName `
    --resource-group $ResourceGroup `
    --startup-file "node server.bundle.js"

Write-Host "`n==> Configuring App Settings (add your secrets below)" -ForegroundColor Cyan
Write-Host "    You must set these manually in the Azure portal or with the next command." -ForegroundColor Yellow
Write-Host ""
Write-Host "    az webapp config appsettings set \\" -ForegroundColor White
Write-Host "        --name $AppName \\" -ForegroundColor White
Write-Host "        --resource-group $ResourceGroup \\" -ForegroundColor White
Write-Host "        --settings \" -ForegroundColor White
Write-Host "            NODE_ENV=production \" -ForegroundColor White
Write-Host "            DATABASE_URL='<your-supabase-session-pooler-url>' \" -ForegroundColor White
Write-Host "            JWT_SECRET='<generate-with: openssl rand -hex 32>' \" -ForegroundColor White
Write-Host "            ALLOWED_ORIGINS='https://<your-web-app-domain>'" -ForegroundColor White
Write-Host ""

Write-Host "`n==> Downloading publish profile for GitHub Actions" -ForegroundColor Cyan
$publishProfile = az webapp deployment list-publishing-profiles `
    --name $AppName `
    --resource-group $ResourceGroup `
    --xml

$profilePath = Join-Path $PSScriptRoot "publish-profile.xml"
$publishProfile | Out-File -FilePath $profilePath -Encoding utf8
Write-Host "    Saved to: $profilePath" -ForegroundColor Green
Write-Host "    Add the contents as a GitHub secret named: AZURE_WEBAPP_PUBLISH_PROFILE" -ForegroundColor Yellow
Write-Host "    (GitHub repo → Settings → Secrets and variables → Actions → New repository secret)" -ForegroundColor Yellow
Write-Host ""
Write-Host "    IMPORTANT: Do NOT commit publish-profile.xml — it is in .gitignore." -ForegroundColor Red

Write-Host "`n==> Done! App URL: https://$AppName.azurewebsites.net" -ForegroundColor Green
