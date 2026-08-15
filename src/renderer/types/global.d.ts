/**
 * global.d.ts
 * 
 * 为 Window 对象添加类型声明，确保 TypeScript 能识别我们暴露的 API。
 * 必须包含 `export {}`，使文件成为模块，才能使用 `declare global`。
 */

export { }; // 这行是关键，将文件标记为外部模块

declare global {

    // 可选：扩展 HTMLWebViewElement 类型，如果后续想直接使用 .src
    // 注意：如果使用 setAttribute，则不需要这个扩展
    interface HTMLWebViewElement {
      src: string;
    }
}