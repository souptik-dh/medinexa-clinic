declare module 'jsvectormap' {
    interface JsVectorMapOptions {
        selector: string;
        map: string;
        regionStyle?: Record<string, unknown>;
        zoomButtons?: boolean;
        backgroundColor?: string;
        onRegionTooltipShow?: (event: unknown, tooltip: unknown, code: string) => void;
        onRegionClick?: (event: unknown, code: string) => void;
        [key: string]: unknown;
    }

    class JsVectorMap {
        constructor(options: JsVectorMapOptions);
        destroy(): void;
        [key: string]: unknown;
    }

    export default JsVectorMap;
}
