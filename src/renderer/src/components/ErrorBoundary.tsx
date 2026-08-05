// src/renderer/src/components/ErrorBoundary.tsx
import { Component, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: any) {
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                this.props.fallback || (
                    <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
                        <h2 className="text-lg font-semibold text-red-800">⚠️ 页面出现错误</h2>
                        <p className="text-sm text-red-600 mt-2">{this.state.error?.message}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                        >
                            刷新页面
                        </button>
                    </div>
                )
            );
        }
        return this.props.children;
    }
}