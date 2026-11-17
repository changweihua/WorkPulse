using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Diagnostics;
using System.Text.Json;
using NewLife.Holiday;
using Microsoft.JavaScript.NodeApi;

[JSExport]
public static class NativeBridge
{
    [JSExport]
    public static string SayHello(string name) => $"Hello {name} from .NET!";

    // 系统信息查询
    [JSExport]
    public static string GetSystemInfo()
    {
        var os = Environment.OSVersion.ToString();
        var cpus = Environment.ProcessorCount;
        var framework = Environment.Version.ToString();
        var machineName = Environment.MachineName;
        var userName = Environment.UserName;
        return $"OS: {os}, CPUs: {cpus}, .NET: {framework}, Machine: {machineName}, User: {userName}";
    }

    // 内存使用（MB）
    [JSExport]
    public static double GetMemoryUsageMB()
    {
        return Math.Round(Environment.WorkingSet / 1024.0 / 1024.0, 2);
    }

    // 进程性能监控
    [JSExport]
    public static string GetPerformanceInfo()
    {
        var process = Process.GetCurrentProcess();
        var cpuTime = process.TotalProcessorTime.TotalMilliseconds;
        var workingSet = process.WorkingSet64 / 1024.0 / 1024.0;
        var threadCount = process.Threads.Count;
        var handleCount = process.HandleCount;
        var startTime = process.StartTime.ToString("yyyy-MM-dd HH:mm:ss");
        var uptime = (DateTime.Now - process.StartTime).TotalMinutes;
        
        return $"CPU Time: {cpuTime:F0}ms, Memory: {workingSet:F2}MB, Threads: {threadCount}, Handles: {handleCount}, Started: {startTime}, Uptime: {uptime:F1}min";
    }

    // 文本哈希计算
    [JSExport]
    public static string ComputeHash(string input, string algorithm = "SHA256")
    {
        if (string.IsNullOrEmpty(input))
            return string.Empty;
            
        HashAlgorithm hasher = algorithm.ToUpper() switch
        {
            "MD5" => MD5.Create(),
            "SHA1" => SHA1.Create(),
            "SHA384" => SHA384.Create(),
            "SHA512" => SHA512.Create(),
            _ => SHA256.Create()
        };
        using (hasher)
        {
            var bytes = Encoding.UTF8.GetBytes(input);
            var hash = hasher.ComputeHash(bytes);
            return Convert.ToHexString(hash).ToLowerInvariant();
        }
    }

    // 文件哈希计算（文件流 IO 属于重活，放到线程池执行，避免阻塞 JS 调用线程）
    // 注意：方法名保持 ComputeFileHash，不加 Async 后缀（[JSExport] camelCase 映射，渲染层调用 computeFileHash）
    // 查询指定年份的中国法定节假日与调休数据（基于 NewLife.Holiday 离线内置库）。
    // 返回 JSON 字符串：{ "YYYY-MM-DD": { "name": "春节", "type": "holiday|workday" } }
    // Status.On（放假）→ holiday，Status.Off（调休上班）→ workday，Normal（常规日）跳过。
    // 保持同步执行：NewLife.Holiday 是内存数据查询、全年遍历耗时极短；更重要的是首次引用
    // 该程序集必须由 JS 调用线程触发，若放进 Task.Run 线程池，node-api-dotnet 的加载
    // 上下文无法解析新程序集，会抛 "operation is not legal in the current state"。
    [JSExport]
    public static string GetChinaHolidays(int year)
    {
        if (year < 1970 || year > 2100)
            throw new ArgumentOutOfRangeException(nameof(year), "年份超出支持范围 1970-2100");

        var map = new Dictionary<string, object>();
        var day = new DateTime(year, 1, 1);
        var end = new DateTime(year, 12, 31);
        while (day <= end)
        {
            var info = HolidayExtensions.China.Query(day).FirstOrDefault();
            if (info != null)
            {
                string? type = info.Status switch
                {
                    HolidayStatus.On => "holiday",
                    HolidayStatus.Off => "workday",
                    _ => null,
                };
                if (type != null)
                {
                    map[day.ToString("yyyy-MM-dd")] = new { name = info.Name, type };
                }
            }
            day = day.AddDays(1);
        }
        return JsonSerializer.Serialize(map);
    }

    [JSExport]
    public static Task<string> ComputeFileHash(string filePath, string algorithm = "SHA256")
    {
        return Task.Run(() =>
        {
            if (!File.Exists(filePath))
                throw new FileNotFoundException($"File not found: {filePath}");

            HashAlgorithm hasher = algorithm.ToUpper() switch
            {
                "MD5" => MD5.Create(),
                "SHA1" => SHA1.Create(),
                "SHA384" => SHA384.Create(),
                "SHA512" => SHA512.Create(),
                _ => SHA256.Create()
            };
            using (hasher)
            {
                using var stream = File.OpenRead(filePath);
                var hash = hasher.ComputeHash(stream);
                return Convert.ToHexString(hash).ToLowerInvariant();
            }
        });
    }
}