declare module 'node-api-dotnet' {
    // 定义加载结果的动态结构
    interface DotNetAssembly {
        [className: string]: {
            [methodName: string]: (...args: any[]) => any;
        };
    }

    // 定义 load 函数及其返回类型
    export function load(path: string): DotNetAssembly;

    // 定义模块默认导出的结构（与 import dotnet from 'node-api-dotnet' 匹配）
    const dotnet: {
        load: typeof load;
    };
    export default dotnet;
}