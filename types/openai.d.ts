// types/openai.d.ts
import 'openai';

declare module 'openai' {
    namespace Chat {
        namespace Completions {
            interface ChatCompletionChunk {
                choices: Array<{
                    delta: {
                        reasoning_content?: string; // 添加扩展字段
                        content?: string | null;
                    };
                }>;
            }
        }
    }
}