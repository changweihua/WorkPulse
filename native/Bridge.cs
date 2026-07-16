using System;
using System.Threading.Tasks;
using Microsoft.JavaScript.NodeApi;

[JSExport]
public static class NativeBridge
{
    [JSExport]
    public static string SayHello(string name)
    {
        return $"Hello {name} from .NET 10!";
    }
}