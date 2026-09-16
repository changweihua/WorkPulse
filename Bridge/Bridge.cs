using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Diagnostics;
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

    // 文件哈希计算
    [JSExport]
    public static string ComputeFileHash(string filePath, string algorithm = "SHA256")
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
    }
}