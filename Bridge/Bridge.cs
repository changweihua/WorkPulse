using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Diagnostics;
using System.Text.Json;
using System.Threading.Tasks;
using NewLife.Holiday;
using Microsoft.JavaScript.NodeApi;
using Windows.Devices.Bluetooth;
using Windows.Devices.Enumeration;
using Windows.Devices.WiFi;
using Windows.Networking.Connectivity;

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

    // ── 网络 / 蓝牙状态采集（WinRT 官方 API，进程内调用）────────────────────
    // 返回 JSON 字符串而非 JS 对象：避免 node-api-dotnet 对托管对象的序列化差异，
    // 主进程 JSON.parse 后与现有 koffi 路径共用同一份类型（src/shared/hw-stats.ts）。
    // 任何异常都返回 "null" 字符串，主进程解析为 null 后自动回退 koffi 实现。

    // ── wlanapi.dll：读取 Windows 原生 wlanSignalQuality（0-100）─────────────
    // 背景：WinRT 的 NetworkRssiInDecibelMilliwatts 是「原始 dBm」，与任务栏/Windows
    // 设置里显示的信号格数不是线性关系（实测 RSSI=-79dBm 时系统报 90%、满格，
    // 而 (-79+100)*2=42% 线性换算只有 1 格，与用户看到的不一致）。
    // 任务栏与 netsh 用的都是 wlanapi 的 wlanSignalQuality，直接读它才能口径一致。
    // 复用主进程 koffi 路径验证过的结构偏移：WLAN_CONNECTION_ATTRIBUTES 中
    // wlanSignalQuality 位于偏移 576（isState 0 / dot11Ssid 520 / signal 576）。
    [DllImport("wlanapi.dll", EntryPoint = "WlanOpenHandle")]
    private static extern uint WlanOpenHandle(
        uint clientVersion, IntPtr reserved, out uint negotiatedVersion, out IntPtr clientHandle);

    [DllImport("wlanapi.dll", EntryPoint = "WlanEnumInterfaces")]
    private static extern uint WlanEnumInterfaces(
        IntPtr clientHandle, IntPtr reserved, out IntPtr interfaceList);

    [DllImport("wlanapi.dll", EntryPoint = "WlanQueryInterface", CharSet = CharSet.Unicode)]
    private static extern uint WlanQueryInterface(
        IntPtr clientHandle, ref Guid interfaceGuid, uint opcode, IntPtr reserved,
        out uint dataSize, out IntPtr data, out uint valueType);

    [DllImport("wlanapi.dll", EntryPoint = "WlanFreeMemory")]
    private static extern void WlanFreeMemory(IntPtr memory);

    [DllImport("wlanapi.dll", EntryPoint = "WlanCloseHandle")]
    private static extern uint WlanCloseHandle(IntPtr clientHandle, IntPtr reserved);

    private const uint WLAN_CLIENT_VERSION = 2;
    // wlan_intf_opcode_current_connection = 7（不是 0！实测传 0 返回 ERROR_INVALID_PARAMETER）。
    private const uint WLAN_OPCODE_CURRENT_CONNECTION = 7;
    // WLAN_INTERFACE_INFO_LIST: dwNumberOfItems(4) + dwIndex(4) + WLAN_INTERFACE_INFO[]
    // WLAN_INTERFACE_INFO: InterfaceGuid(16) + strInterfaceDescription(512) + isState(4) = 532
    private const int WLAN_IFACE_LIST_HEADER = 8;
    private const int WLAN_IFACE_INFO_SIZE = 532;
    // WLAN_INTERFACE_STATE：1 = connected（0=not_ready/4=disconnected/6=discovering...）
    private const int WLAN_IFACE_STATE_CONNECTED = 1;
    private const int WLAN_CA_OFF_SIGNAL_QUALITY = 576;
    private const int WLAN_CA_MIN_SIZE = 580;

    /// <summary>
    /// 用 wlanapi 读取当前已连接接口的原生信号质量（0-100），失败返回 null。
    /// 与任务栏 / netsh wlan show interfaces 报的「信号 XX%」同一口径。
    /// </summary>
    private static int? ReadNativeSignalQuality()
    {
        IntPtr client = IntPtr.Zero;
        IntPtr list = IntPtr.Zero;
        IntPtr data = IntPtr.Zero;
        try
        {
            uint neg;
            if (WlanOpenHandle(WLAN_CLIENT_VERSION, IntPtr.Zero, out neg, out client) != 0 || client == IntPtr.Zero)
                return null;
            if (WlanEnumInterfaces(client, IntPtr.Zero, out list) != 0 || list == IntPtr.Zero)
                return null;

            uint count = (uint)Marshal.ReadInt32(list, 0);
            for (uint i = 0; i < count; i++)
            {
                IntPtr info = IntPtr.Add(list, WLAN_IFACE_LIST_HEADER + (int)i * WLAN_IFACE_INFO_SIZE);
                int state = Marshal.ReadInt32(info, 528); // GUID16 + desc512 = 528
                if (state != WLAN_IFACE_STATE_CONNECTED) continue;

                Guid guid = Marshal.PtrToStructure<Guid>(info); // 结构首字段即 InterfaceGuid
                uint size, vt;
                if (WlanQueryInterface(client, ref guid, WLAN_OPCODE_CURRENT_CONNECTION,
                        IntPtr.Zero, out size, out data, out vt) != 0 || data == IntPtr.Zero || size < WLAN_CA_MIN_SIZE)
                    return null;

                int quality = Marshal.ReadInt32(data, WLAN_CA_OFF_SIGNAL_QUALITY);
                if (quality < 0 || quality > 100) return null;
                return quality;
            }
            return null;
        }
        catch
        {
            return null;
        }
        finally
        {
            if (data != IntPtr.Zero) WlanFreeMemory(data);
            if (list != IntPtr.Zero) WlanFreeMemory(list);
            if (client != IntPtr.Zero) WlanCloseHandle(client, IntPtr.Zero);
        }
    }

    /// <summary>
    /// 当前 Wi-Fi 连接状态与信号强度。
    /// 先取当前连接的 ConnectionProfile 拿到真实 SSID（GetConnectedSsid，
    /// 不用 ProfileName——Windows 允许网络配置名与 SSID 不同），再对 NetworkReport
    /// 按 SSID 精确匹配，避免「取信号最强网络」误把邻居 AP 当成自己连的那个。
    /// signal 优先取 Windows 原生 wlanSignalQuality（与任务栏/netsh 一致），
    /// 失败时回退 RSSI 线性换算；rssi = 原始 dBm（仅诊断用，不参与格数）。
    /// </summary>
    [JSExport]
    public static async Task<string> GetWifiStatus()
    {
        try
        {
            var adapters = await WiFiAdapter.FindAllAdaptersAsync();
            if (adapters.Count == 0)
                return "{\"available\":false}";

            var adapter = adapters[0];
            var connected = await adapter.NetworkAdapter.GetConnectedProfileAsync();
            if (connected == null)
                return "{\"available\":true,\"connected\":false}";

            // GetConnectedSsid 是 WinRT 官方「当前连接 SSID」；ProfileName 只是配置名，
            // 用户可在 Windows 里重命名网络配置，两者不一致时会匹配不到扫描结果。
            var ssid = connected.WlanConnectionProfileDetails?.GetConnectedSsid()
                ?? connected.ProfileName
                ?? "";
            int signal = 0;
            double rssi = 0;
            bool gotSignal = false;

            // 诊断用 rssi：从扫描结果按 SSID 精确匹配取原始 dBm（不参与格数计算）
            try
            {
                await adapter.ScanAsync();
                foreach (var net in adapter.NetworkReport.AvailableNetworks)
                {
                    if (!string.Equals(net.Ssid, ssid, StringComparison.Ordinal)) continue;
                    rssi = net.NetworkRssiInDecibelMilliwatts;
                    gotSignal = true;
                    break;
                }
            }
            catch
            {
                // 扫描失败不影响信号质量读取（下面走 wlanapi），仅 rssi 未知
            }

            // 信号质量：优先 Windows 原生 wlanSignalQuality（与任务栏/netsh 同一口径）。
            // 回退：RSSI 线性换算（-50dBm→100%、-100dBm→0%）。
            int? nativeQuality = ReadNativeSignalQuality();
            if (nativeQuality.HasValue)
            {
                signal = nativeQuality.Value;
                gotSignal = true;
            }
            else if (gotSignal)
            {
                signal = (int)Math.Clamp((rssi + 100) * 2, 0, 100);
            }

            var level = connected.GetNetworkConnectivityLevel();
            bool? hasInternet = level switch
            {
                NetworkConnectivityLevel.InternetAccess => true,
                NetworkConnectivityLevel.ConstrainedInternetAccess => true,
                NetworkConnectivityLevel.LocalAccess => false,
                NetworkConnectivityLevel.None => false,
                _ => null,
            };

            // 分档阈值与主进程 signalToBars 保持一致（5 格：>=90→5、>=75→4、>=55→3、>=30→2、>=1→1）。
            // signal 是原生 wlanSignalQuality，94% 这样的强信号正确落到满格 5。
            var bars = signal >= 90 ? 5 : signal >= 75 ? 4 : signal >= 55 ? 3 : signal >= 30 ? 2 : signal >= 1 ? 1 : 0;
            var payload = new
            {
                available = true,
                connected = true,
                ssid = ssid.Length > 0 ? ssid : null,
                signal = gotSignal ? signal : (int?)null,
                bars,
                rssi = rssi != 0 ? rssi : (double?)null,
                hasInternet,
            };
            return JsonSerializer.Serialize(payload);
        }
        catch
        {
            return "null";
        }
    }

    /// <summary>
    /// 系统级互联网连通性：true=可上网 false=明确不可 null=未知。
    /// 与 GetNetworkConnectivityHint 同为 NLM 口径，但走 WinRT 官方托管 API。
    /// </summary>
    [JSExport]
    public static string GetInternetStatus()
    {
        try
        {
            var profile = NetworkInformation.GetInternetConnectionProfile();
            if (profile == null) return "null";
            bool? online = profile.GetNetworkConnectivityLevel() switch
            {
                NetworkConnectivityLevel.InternetAccess => true,
                NetworkConnectivityLevel.ConstrainedInternetAccess => true,
                NetworkConnectivityLevel.LocalAccess => false,
                NetworkConnectivityLevel.None => false,
                _ => null,
            };
            return online.HasValue ? (online.Value ? "true" : "false") : "null";
        }
        catch
        {
            return "null";
        }
    }

    /// <summary>
    /// 当前在场的蓝牙外设（已配对且设备节点存在）。
    ///
    /// 口径说明（实测校准）：不能用 GetDeviceSelectorFromConnectionStatus(Connected)——
    /// RAPOO/M720 这类 BLE HID 鼠标键盘由系统 HID 栈持有连接，WinRT 的
    /// ConnectionStatus 对它们恒为 Disconnected，会把正在用的鼠标漏成 0 台。
    /// 因此改为枚举「已配对 + 在场」设备（与系统蓝牙设置列表一致），
    /// 排除本机无线电与系统协议栈条目。
    /// 返回 { available, devices: [{ name, battery }] }；battery 恒 null（WinRT 电量需 GATT 订阅）。
    /// </summary>
    [JSExport]
    public static async Task<string> GetConnectedBluetooth()
    {
        try
        {
            // 两类协议都要枚举：经典蓝牙(BR/EDR) + 低功耗蓝牙(BLE)
            var selectors = new[]
            {
                BluetoothDevice.GetDeviceSelector(),      // 经典：耳机/音箱等
                BluetoothLEDevice.GetDeviceSelector(),    // BLE：鼠标/键盘/手环等
            };
            var list = new List<object>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var selector in selectors)
            {
                var devices = await DeviceInformation.FindAllAsync(selector);
                foreach (var d in devices)
                {
                    var name = d.Name?.Trim();
                    if (string.IsNullOrEmpty(name)) continue;
                    // 排除本机无线电/系统协议栈（与 koffi 回退路径的 HOST_DEVICE_PATTERN 同口径）
                    if (IsHostBluetoothDevice(name)) continue;
                    if (!seen.Add(name)) continue;
                    list.Add(new { name, battery = (int?)null });
                }
            }
            return JsonSerializer.Serialize(new { available = true, devices = list });
        }
        catch
        {
            return "null";
        }
    }

    /// <summary>本机蓝牙无线电/系统协议栈条目，不算外设</summary>
    private static bool IsHostBluetoothDevice(string name)
    {
        var n = name.ToLowerInvariant();
        return n.Contains("bluetooth device (rfcomm")
            || n.Contains("bluetooth device (personal area")
            || n.Contains("bluetooth le enumerator")
            || n.Contains("bluetooth enumerator")
            || n.Contains("wireless bluetooth")
            || n.Contains("microsoft bluetooth")
            || n.Contains("蓝牙 le 枚举器")
            || n.Contains("蓝牙枚举器");
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