Get-ChildItem 'c:\GitHub上传\EnglishMaster\data\' -Filter *.json | ForEach-Object {
    Write-Host ($_.Name + ' = ' + [math]::Round($_.Length/1KB,2) + ' KB')
}
