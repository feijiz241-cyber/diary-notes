# 探测 Windows 把某个文件归到哪个安全区域（0=本地计算机 3=Internet）。
# 这个值就是「打开文件 - 安全警告」是否弹出的直接依据。
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File scripts\zone-probe.ps1 <文件...>
# 注意：Zone 类只在 .NET Framework 里有，必须用 powershell.exe（5.1）跑，不能用 pwsh。

param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Files)

foreach ($f in $Files) {
  $p = (Resolve-Path -LiteralPath $f).Path
  try {
    $zone = [System.Security.Policy.Zone]::CreateFromUrl($p).SecurityZone
    '{0} -> zone {1}' -f (Split-Path $p -Leaf), [int]$zone
  } catch {
    '{0} -> 探测失败：{1}' -f (Split-Path $p -Leaf), $_.Exception.Message
  }
}
