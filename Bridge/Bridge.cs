using Microsoft.JavaScript.NodeApi;

[JSExport]
public static class NativeBridge
{
    [JSExport]
    public static string SayHello(string name) => $"Hello {name} from .NET!";
}