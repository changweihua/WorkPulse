import 'react-router-dom';

declare module 'react-router-dom' {
    export interface Handle {
        maxWidth?: boolean;
    }
}