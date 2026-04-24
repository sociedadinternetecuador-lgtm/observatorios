$ProjectPath = "C:\PROJECTS\OBSERVATORIOS\observatorio-electrico"
$RepoUrl = "https://github.com/sociedadinternetecuador-lgtm/observatorios-ecuador.git"

cd $ProjectPath

if (!(Test-Path ".gitignore")) {
@"
node_modules
dist
.env
.DS_Store
.vscode
"@ | Out-File -Encoding utf8 ".gitignore"
}

if (!(Test-Path ".git")) {
    git init
}

git branch -M main

$remote = git remote
if ($remote -notcontains "origin") {
    git remote add origin $RepoUrl
} else {
    git remote set-url origin $RepoUrl
}

git add .

git commit -m "Version inicial observatorio electrico"

git push -u origin main

Write-Host "Proyecto publicado en GitHub correctamente." -ForegroundColor Green