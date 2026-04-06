/** Tool definitions for Safari */
export declare const safariTools: ({
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            limit: {
                type: string;
                description: string;
            };
            days: {
                type: string;
                description: string;
            };
            query?: undefined;
            folder?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            days?: undefined;
            folder?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            folder: {
                type: string;
                description: string;
            };
            limit?: undefined;
            days?: undefined;
            query?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            limit?: undefined;
            days?: undefined;
            query?: undefined;
            folder?: undefined;
        };
        required?: undefined;
    };
})[];
/** Handle a Safari tool call. Returns null if tool name not recognized. */
export declare function handleSafariTool(name: string, args: Record<string, unknown>): {
    content: Array<{
        type: string;
        text: string;
    }>;
    isError?: boolean;
} | null;
